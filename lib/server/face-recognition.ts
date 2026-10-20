import "server-only";

import path from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import * as faceapi from "face-api.js";
import { parseFaceDescriptor } from "@/lib/helper/face-descriptor";

// Keep identity verification active, with a little tolerance for mobile-camera
// lighting and angle differences against the registered reference photo.
const MATCH_DISTANCE_THRESHOLD = 0.48;
// Compare the two instructed poses directly. Requiring each pose to cross the
// initial center line caused valid movement to fail when the initial pose was
// already slightly angled. This lower spread still rejects a stationary face.
const MINIMUM_TOTAL_YAW_SPREAD = 0.055;
const IDENTITY_FRAME_COUNT = 2;
const IDENTITY_DETECTOR_INPUT_SIZE = 160;
const MOVEMENT_DETECTOR_INPUT_SIZE = 128;
const DETECTOR_SCORE_THRESHOLD = 0.2;
const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;
const referenceDescriptorCache = new Map<string, Float32Array>();
const pendingReferenceDescriptors = new Map<string, Promise<Float32Array | null>>();
let serverModelsPromise: Promise<void> | undefined;

type LandmarkDetection = faceapi.WithFaceLandmarks<
  { detection: faceapi.FaceDetection },
  faceapi.FaceLandmarks68
>;
type Detection = faceapi.WithFaceDescriptor<LandmarkDetection>;

type DetectedFrame<TDetection extends LandmarkDetection = LandmarkDetection> = {
  detection: TDetection;
  width: number;
  height: number;
};

export type ServerFaceVerificationResult =
  | { ok: true; score: number }
  | {
      ok: false;
      reason: "no-reference" | "no-face" | "position" | "no-match" | "movement";
      message: string;
      score?: number;
    };

function ensureFaceApiNodeEnvironment() {
  // Next.js bundles CommonJS modules and removes the `require`/`module` globals
  // used by face-api.js for automatic Node detection. Set the Node environment
  // explicitly on every request. A module-scoped/global readiness flag is not
  // reliable during Next.js hot reload because the face-api module can change.
  faceapi.env.setEnv(faceapi.env.createNodejsEnv());
}

function ensureServerModelsLoaded() {
  ensureFaceApiNodeEnvironment();
  if (serverModelsPromise) return serverModelsPromise;

  const modelPath = path.join(process.cwd(), "public", "models");
  serverModelsPromise = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath),
    faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath),
    faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath),
  ])
    .then(() => undefined)
    .catch((error) => {
      serverModelsPromise = undefined;
      throw error;
    });

  return serverModelsPromise;
}

export async function warmFaceRecognitionServer(referenceImageUrl?: string) {
  await ensureServerModelsLoaded();
  if (referenceImageUrl) await loadReferenceDescriptor(referenceImageUrl);
}

function decodeImage(imageBuffer: Buffer) {
  if (
    imageBuffer.length >= 3 &&
    imageBuffer[0] === 0xff &&
    imageBuffer[1] === 0xd8 &&
    imageBuffer[2] === 0xff
  ) {
    const decoded = jpeg.decode(imageBuffer, {
      useTArray: true,
      formatAsRGBA: false,
      maxResolutionInMP: 4,
      maxMemoryUsageInMB: 64,
    });
    return decoded;
  }

  if (
    imageBuffer.length >= 4 &&
    imageBuffer[0] === 0x89 &&
    imageBuffer[1] === 0x50 &&
    imageBuffer[2] === 0x4e &&
    imageBuffer[3] === 0x47
  ) {
    const decoded = PNG.sync.read(imageBuffer);
    if (decoded.width * decoded.height > 4_000_000) {
      throw new Error("FACE_IMAGE_DIMENSIONS_TOO_LARGE");
    }
    const rgb = new Uint8Array(decoded.width * decoded.height * 3);
    for (let source = 0, target = 0; source < decoded.data.length; source += 4) {
      rgb[target] = decoded.data[source];
      rgb[target + 1] = decoded.data[source + 1];
      rgb[target + 2] = decoded.data[source + 2];
      target += 3;
    }
    return { data: rgb, width: decoded.width, height: decoded.height };
  }

  throw new Error("FACE_IMAGE_FORMAT_UNSUPPORTED");
}

function createImageTensor(imageBuffer: Buffer) {
  const decoded = decodeImage(imageBuffer);
  return {
    tensor: faceapi.tf.tensor3d(
      decoded.data,
      [decoded.height, decoded.width, 3],
      "int32",
    ),
    width: decoded.width,
    height: decoded.height,
  };
}

async function detectFaceLandmarks(imageBuffer: Buffer): Promise<DetectedFrame | null> {
  const image = createImageTensor(imageBuffer);
  try {
    const detection = await faceapi
      .detectSingleFace(
        image.tensor,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: MOVEMENT_DETECTOR_INPUT_SIZE,
          scoreThreshold: DETECTOR_SCORE_THRESHOLD,
        }),
      )
      .withFaceLandmarks();
    return detection ? { detection, width: image.width, height: image.height } : null;
  } finally {
    image.tensor.dispose();
  }
}

async function detectFaceIdentity(imageBuffer: Buffer): Promise<DetectedFrame<Detection> | null> {
  const image = createImageTensor(imageBuffer);
  try {
    const detection = await faceapi
      .detectSingleFace(
        image.tensor,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: IDENTITY_DETECTOR_INPUT_SIZE,
          scoreThreshold: DETECTOR_SCORE_THRESHOLD,
        }),
      )
      .withFaceLandmarks()
      .withFaceDescriptor();
    return detection ? { detection, width: image.width, height: image.height } : null;
  } finally {
    image.tensor.dispose();
  }
}

function isAllowedReferenceUrl(value: string) {
  try {
    const url = new URL(value);
    const configuredHost = process.env.MINIO_PUBLIC_URL
      ? new URL(process.env.MINIO_PUBLIC_URL).hostname
      : "s3.jahris.id";
    const allowedHosts = new Set([
      configuredHost,
      "s3.jahris.id",
      "s3-jaxer.tetrabit.my.id",
      "103.31.204.110",
    ]);
    return (url.protocol === "https:" || url.protocol === "http:") && allowedHosts.has(url.hostname);
  } catch {
    return false;
  }
}

async function loadReferenceDescriptor(referenceImageUrl: string) {
  const cached = referenceDescriptorCache.get(referenceImageUrl);
  if (cached) return cached;
  if (!isAllowedReferenceUrl(referenceImageUrl)) return null;

  const pending = pendingReferenceDescriptors.get(referenceImageUrl);
  if (pending) return pending;

  const descriptorPromise = (async () => {
    try {
      const response = await fetch(referenceImageUrl, {
        signal: AbortSignal.timeout(8_000),
        redirect: "follow",
        cache: "force-cache",
      });
      if (!response.ok) return null;
      const declaredLength = Number(response.headers.get("content-length") || 0);
      if (declaredLength > MAX_REFERENCE_IMAGE_BYTES) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > MAX_REFERENCE_IMAGE_BYTES) return null;
      const frame = await detectFaceIdentity(buffer);
      if (!frame) return null;

      referenceDescriptorCache.set(referenceImageUrl, frame.detection.descriptor);
      return frame.detection.descriptor;
    } catch (error) {
      console.warn("Unable to build face descriptor from avatar", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      pendingReferenceDescriptors.delete(referenceImageUrl);
    }
  })();

  pendingReferenceDescriptors.set(referenceImageUrl, descriptorPromise);
  return descriptorPromise;
}

function isWellPositioned(detection: LandmarkDetection, width: number, height: number) {
  const box = detection.detection.box;
  const centerX = (box.x + box.width / 2) / width;
  const centerY = (box.y + box.height / 2) / height;
  return (
    box.width / width >= 0.16 &&
    box.height / height >= 0.16 &&
    centerX >= 0.1 &&
    centerX <= 0.9 &&
    centerY >= 0.08 &&
    centerY <= 0.9
  );
}

function getYawRatio(landmarks: faceapi.FaceLandmarks68) {
  const nose = landmarks.getNose();
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const noseTip = nose[3];
  const leftEyeCenterX = leftEye.reduce((sum, point) => sum + point.x, 0) / leftEye.length;
  const rightEyeCenterX = rightEye.reduce((sum, point) => sum + point.x, 0) / rightEye.length;
  const eyeCenterX = (leftEyeCenterX + rightEyeCenterX) / 2;
  const eyeDistance = Math.max(Math.abs(rightEyeCenterX - leftEyeCenterX), 1);
  return (noseTip.x - eyeCenterX) / eyeDistance;
}

async function runVerification(
  frameBuffers: Buffer[],
  storedDescriptor: unknown,
  referenceImageUrl?: string,
): Promise<ServerFaceVerificationResult> {
  await ensureServerModelsLoaded();
  // Build the reference with the same Node pipeline used for live frames.
  // Browser-generated descriptors remain a fallback for inaccessible legacy
  // avatars, but are no longer preferred because cross-runtime differences can
  // incorrectly push the distance above the match threshold.
  const serverReference = referenceImageUrl
    ? await loadReferenceDescriptor(referenceImageUrl)
    : null;
  const parsedDescriptor = parseFaceDescriptor(storedDescriptor);
  const reference = serverReference ?? (
    parsedDescriptor ? new Float32Array(parsedDescriptor) : null
  );
  if (!reference) {
    return {
      ok: false,
      reason: "no-reference",
      message: "Data wajah belum terdaftar. Hubungi admin untuk mendaftarkan wajah.",
    };
  }

  // Usually only the first identity frame is needed. The second one is a
  // fallback for blur/poor expression and is intentionally evaluated lazily.
  const identityMatches: Array<{
    frame: DetectedFrame<Detection>;
    distance: number;
  }> = [];
  let detectedIdentityFrame = false;
  for (let index = 0; index < IDENTITY_FRAME_COUNT; index += 1) {
    const frame = await detectFaceIdentity(frameBuffers[index]);
    if (!frame) continue;
    detectedIdentityFrame = true;
    if (!isWellPositioned(frame.detection, frame.width, frame.height)) continue;

    const distance = faceapi.euclideanDistance(frame.detection.descriptor, reference);
    identityMatches.push({ frame, distance });
    if (distance <= MATCH_DISTANCE_THRESHOLD) break;
  }

  if (!detectedIdentityFrame) {
    return {
      ok: false,
      reason: "no-face",
      message: "Wajah belum terbaca. Hadapkan wajah ke kamera lalu coba lagi.",
    };
  }
  if (identityMatches.length === 0) {
    return {
      ok: false,
      reason: "position",
      message: "Arahkan wajah ke kamera dan pastikan sebagian besar wajah terlihat.",
    };
  }
  const bestIdentityMatch = identityMatches.reduce((best, current) =>
    current.distance < best.distance ? current : best,
  );
  const distance = bestIdentityMatch.distance;
  const score = Math.max(0, 1 - distance);
  if (distance > MATCH_DISTANCE_THRESHOLD) {
    return {
      ok: false,
      reason: "no-match",
      message: "Wajah tidak cocok dengan data pengguna.",
      score,
    };
  }

  // These frames are independent. Starting both detections together avoids an
  // unnecessary serial wait on runtimes that can schedule tensor work in parallel.
  const [rightTurnFrame, leftTurnFrame] = await Promise.all([
    detectFaceLandmarks(frameBuffers[IDENTITY_FRAME_COUNT]),
    detectFaceLandmarks(frameBuffers[IDENTITY_FRAME_COUNT + 1]),
  ]);
  if (!rightTurnFrame || !leftTurnFrame) {
    return {
      ok: false,
      reason: "no-face",
      message: "Wajah tidak terbaca saat bergerak. Gerakkan kepala ke kanan lalu ke kiri dengan lebih pelan.",
    };
  }

  const rightTurnYaw = getYawRatio(rightTurnFrame.detection.landmarks);
  const leftTurnYaw = getYawRatio(leftTurnFrame.detection.landmarks);
  const totalYawSpread = Math.abs(rightTurnYaw - leftTurnYaw);
  const hasBothTurns = totalYawSpread >= MINIMUM_TOTAL_YAW_SPREAD;
  if (!hasBothTurns) {
    return {
      ok: false,
      reason: "movement",
      message: "Gerakan belum lengkap. Gerakkan kepala ke kanan, lalu ke kiri sesuai instruksi.",
      score,
    };
  }

  return { ok: true, score };
}

export async function verifyFaceOnServer(
  frameBuffers: Buffer[],
  storedDescriptor: unknown,
  referenceImageUrl?: string,
) {
  return runVerification(frameBuffers, storedDescriptor, referenceImageUrl);
}
