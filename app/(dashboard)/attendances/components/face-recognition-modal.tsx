"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as faceapi from "face-api.js";
import { X, Camera, CheckCircle, XCircle, Loader2, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ensureFaceModelLoaded } from "@/lib/helper/face-models";
import { parseFaceDescriptor } from "@/lib/helper/face-descriptor";
import {
  getCachedFaceDescriptor,
  loadAndCacheFaceDescriptor,
} from "@/lib/helper/face-reference-cache";
import { reportFacePerformance } from "@/lib/helper/face-performance";

interface FaceRecognitionModalProps {
  isOpen: boolean;
  mode: "check-in" | "check-out" | "break-in" | "break-out";
  referenceImageUrl: string | null;
  referenceDescriptor: number[] | null;
  onSuccess: (captureDataUrl: string) => void;
  onClose: () => void;
}

type ScanStatus =
  | "loading-models"
  | "loading-reference"
  | "scanning"
  | "position-required"
  | "movement-required"
  | "glasses-detected"
  | "match"
  | "no-match"
  | "no-face"
  | "no-reference"
  | "error"
  | "no-camera";

export default function FaceRecognitionModal({
  isOpen,
  mode,
  referenceImageUrl,
  referenceDescriptor,
  onSuccess,
  onClose,
}: FaceRecognitionModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const referenceDescriptorRef = useRef<Float32Array | null>(null);
  const referenceKeyRef = useRef<string | null>(null);
  const successCalledRef = useRef(false);
  const modalOpenedAtRef = useRef(0);

  const consecutiveNoFaceRef = useRef(0);
  const faceMatchedRef = useRef(false);
  const baselineYawRef = useRef<number | null>(null);
  const turnedLeftRef = useRef(false);
  const turnedRightRef = useRef(false);
  const leftTurnFramesRef = useRef(0);
  const rightTurnFramesRef = useRef(0);
  const movementStartedAtRef = useRef(0);

  const [status, setStatus] = useState<ScanStatus>("loading-models");
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [showStartupSplash, setShowStartupSplash] = useState(false);
  const startupSplashDoneRef = useRef(false);
  const splashTimersRef = useRef<{
    show: number | null;
    hide: number | null;
  }>({
    show: null,
    hide: null,
  });

  const stopCamera = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const getCaptureDataUrl = useCallback(() => {
    if (!videoRef.current) return "";
    const video = videoRef.current;
    const maxWidth = 480;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const snapshotCanvas = document.createElement("canvas");
    snapshotCanvas.width = Math.round(video.videoWidth * scale);
    snapshotCanvas.height = Math.round(video.videoHeight * scale);
    const ctx = snapshotCanvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
    return snapshotCanvas.toDataURL("image/jpeg", 0.75);
  }, []);

  const cleanup = useCallback(() => {
    stopCamera();
    successCalledRef.current = false;
    consecutiveNoFaceRef.current = 0;
    faceMatchedRef.current = false;
    baselineYawRef.current = null;
    turnedLeftRef.current = false;
    turnedRightRef.current = false;
    leftTurnFramesRef.current = 0;
    rightTurnFramesRef.current = 0;
    movementStartedAtRef.current = 0;
    setStatus("loading-models");
    setMatchScore(null);
  }, [stopCamera]);

  useEffect(() => {
    if (!isOpen) return;
    modalOpenedAtRef.current = performance.now();

    const timers = splashTimersRef.current;

    if (timers.show !== null) {
      window.clearTimeout(timers.show);
      timers.show = null;
    }
    if (timers.hide !== null) {
      window.clearTimeout(timers.hide);
      timers.hide = null;
    }

    if (!startupSplashDoneRef.current) {
      timers.show = window.setTimeout(() => {
        setShowStartupSplash(true);
        timers.hide = window.setTimeout(() => {
          setShowStartupSplash(false);
          startupSplashDoneRef.current = true;
        }, 650);
      }, 0);
    } else {
      timers.hide = window.setTimeout(() => {
        setShowStartupSplash(false);
      }, 0);
    }

    return () => {
      if (timers.show !== null) {
        window.clearTimeout(timers.show);
        timers.show = null;
      }
      if (timers.hide !== null) {
        window.clearTimeout(timers.hide);
        timers.hide = null;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (modelsLoaded) return;
    const load = async () => {
      try {
        await ensureFaceModelLoaded("attendance-recognition", [
          () => faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          () => faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
          () => faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
        ]);
        setModelsLoaded(true);
      } catch {
        setStatus("error");
      }
    };
    load();
  }, [modelsLoaded]);

  useEffect(() => {
    if (!isOpen) return;
    if (!modelsLoaded) return;

    let cancelled = false;

    const run = async () => {
      const referenceKey = referenceImageUrl ?? "stored-descriptor";
      if (referenceKeyRef.current !== referenceKey) {
        referenceDescriptorRef.current = null;
        referenceKeyRef.current = referenceKey;
      }
      const storedDescriptor = parseFaceDescriptor(referenceDescriptor);
      const cachedDescriptor = referenceImageUrl
        ? getCachedFaceDescriptor(referenceImageUrl)
        : null;

      if (storedDescriptor) {
        referenceDescriptorRef.current = new Float32Array(storedDescriptor);
      } else if (cachedDescriptor) {
        referenceDescriptorRef.current = cachedDescriptor;
      }
      const descriptorSource = storedDescriptor
        ? "database" as const
        : cachedDescriptor
          ? "cache" as const
          : "image" as const;

      if (!referenceDescriptorRef.current && !referenceImageUrl) {
        setStatus("no-reference");
        return;
      }

      const loadReference = async () => {
        if (referenceDescriptorRef.current || !referenceImageUrl) return;
        setStatus("loading-reference");
        try {
          referenceDescriptorRef.current = await loadAndCacheFaceDescriptor(referenceImageUrl);
        } catch {
          referenceDescriptorRef.current = null;
        }
      };

      const startCamera = async () => {
        const startedAt = performance.now();
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "user" },
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 30, max: 30 },
              aspectRatio: { ideal: 4 / 3 },
            },
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return null;
          }

          streamRef.current = stream;

          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack && typeof videoTrack.getCapabilities === "function") {
            const capabilities = videoTrack.getCapabilities() as MediaTrackCapabilities & {
              zoom?: { min: number; max: number; step: number };
            };
            const minimumZoom = capabilities.zoom?.min;

            if (typeof minimumZoom === "number" && Number.isFinite(minimumZoom)) {
              try {
                await videoTrack.applyConstraints({
                  advanced: [{ zoom: minimumZoom } as MediaTrackConstraintSet],
                });
              } catch {
                // Keep the camera's default zoom when the device rejects the constraint.
              }
            }
          }

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          return performance.now() - startedAt;
        } catch {
          if (!cancelled) setStatus("no-camera");
          return null;
        }
      };

      if (referenceDescriptorRef.current) setStatus("scanning");
      const referenceStartedAt = performance.now();
      const [, cameraMs] = await Promise.all([loadReference(), startCamera()]);
      const referenceMs = performance.now() - referenceStartedAt;

      if (cancelled) return;

      if (!referenceDescriptorRef.current) {
        setStatus("no-reference");
        stopCamera();
        reportFacePerformance({
          event: "failure",
          mode,
          descriptorSource,
          totalMs: performance.now() - modalOpenedAtRef.current,
          referenceMs,
          cameraMs: cameraMs ?? undefined,
          reason: "no-reference",
        });
        return;
      }

      if (cameraMs === null) return;
      setStatus("scanning");
      reportFacePerformance({
        event: "ready",
        mode,
        descriptorSource,
        totalMs: performance.now() - modalOpenedAtRef.current,
        referenceMs,
        cameraMs,
      });

      const scanCanvas = document.createElement("canvas");
      const scanContext = scanCanvas.getContext("2d");
      let lastIdentityCheckAt = -Infinity;
      const getYawRatio = (landmarks: faceapi.FaceLandmarks68) => {
        const nose = landmarks.getNose();
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        const noseTip = nose[3];
        const leftEyeCenterX = leftEye.reduce((sum, point) => sum + point.x, 0) / leftEye.length;
        const rightEyeCenterX = rightEye.reduce((sum, point) => sum + point.x, 0) / rightEye.length;
        const eyeCenterX = (leftEyeCenterX + rightEyeCenterX) / 2;
        const eyeDistance = Math.max(Math.abs(rightEyeCenterX - leftEyeCenterX), 1);
        return (noseTip.x - eyeCenterX) / eyeDistance;
      };

      const detectFrame = async () => {
        if (!videoRef.current || cancelled || successCalledRef.current) return;
        const frameStartedAt = performance.now();
        const scheduleNextFrame = () => {
          if (cancelled || successCalledRef.current) return;
          const delay = Math.max(0, 50 - (performance.now() - frameStartedAt));
          timeoutRef.current = setTimeout(() => void detectFrame(), delay);
        };

        const video = videoRef.current;
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          scheduleNextFrame();
          return;
        }

        let detection;
        try {
          if (!scanContext) throw new Error("Camera canvas unavailable");
          if (scanCanvas.width !== video.videoWidth || scanCanvas.height !== video.videoHeight) {
            scanCanvas.width = video.videoWidth;
            scanCanvas.height = video.videoHeight;
          }
          scanContext.drawImage(video, 0, 0);
          detection = await faceapi
            .detectSingleFace(
              scanCanvas,
              new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }),
            )
            .withFaceLandmarks();
        } catch {
          if (!cancelled) {
            setStatus("error");
            stopCamera();
          }
          return;
        }

        if (cancelled || successCalledRef.current) return;

        if (!detection) {
          consecutiveNoFaceRef.current += 1;
          // Avoid flickering when a slower phone misses only one or two frames.
          if (consecutiveNoFaceRef.current >= 4 && !cancelled) setStatus("no-face");
          scheduleNextFrame();
          return;
        }
        consecutiveNoFaceRef.current = 0;

        const faceBox = detection.detection.box;
        const faceCenterX = (faceBox.x + faceBox.width / 2) / scanCanvas.width;
        const faceCenterY = (faceBox.y + faceBox.height / 2) / scanCanvas.height;
        const faceWidthRatio = faceBox.width / scanCanvas.width;
        const faceHeightRatio = faceBox.height / scanCanvas.height;
        const faceIsWellPositioned =
          faceWidthRatio >= 0.24 &&
          faceHeightRatio >= 0.24 &&
          faceCenterX >= 0.25 &&
          faceCenterX <= 0.75 &&
          faceCenterY >= 0.2 &&
          faceCenterY <= 0.72;

        if (!faceIsWellPositioned) {
          if (!cancelled) setStatus("position-required");
          scheduleNextFrame();
          return;
        }

        if (!referenceDescriptorRef.current) {
          if (!cancelled) setStatus("no-reference");
          scheduleNextFrame();
          return;
        }

        // Descriptor extraction is expensive, so it stops after identity match.
        // The following frames only check a real change in head pose (liveness).
        if (!faceMatchedRef.current) {
          if (performance.now() - lastIdentityCheckAt < 250) {
            scheduleNextFrame();
            return;
          }
          lastIdentityCheckAt = performance.now();

          let verified;
          try {
            verified = await new faceapi.ComputeSingleFaceDescriptorTask(
              Promise.resolve(detection),
              scanCanvas,
            );
          } catch {
            scheduleNextFrame();
            return;
          }
          if (cancelled || successCalledRef.current) return;
          if (!verified) {
            scheduleNextFrame();
            return;
          }

          const distance = faceapi.euclideanDistance(
            verified.descriptor,
            referenceDescriptorRef.current,
          );
          const score = Math.max(0, 1 - distance);
          setMatchScore(score);

          if (distance <= 0.45) {
            faceMatchedRef.current = true;
            baselineYawRef.current = getYawRatio(detection.landmarks);
            turnedLeftRef.current = false;
            turnedRightRef.current = false;
            leftTurnFramesRef.current = 0;
            rightTurnFramesRef.current = 0;
            movementStartedAtRef.current = performance.now();
            setStatus("movement-required");
            scheduleNextFrame();
          } else {
            setStatus("no-match");
            scheduleNextFrame();
          }
          return;
        }

        const baselineYaw = baselineYawRef.current;
        const yawChange = baselineYaw === null
          ? 0
          : getYawRatio(detection.landmarks) - baselineYaw;

        const REQUIRED_HOLD_FRAMES = 2;
        const MINIMUM_MOVEMENT_MS = 1000;

        if (yawChange <= -0.06) {
          leftTurnFramesRef.current += 1;
          rightTurnFramesRef.current = 0;
          if (leftTurnFramesRef.current >= REQUIRED_HOLD_FRAMES) {
            turnedLeftRef.current = true;
          }
        } else if (yawChange >= 0.06) {
          rightTurnFramesRef.current += 1;
          leftTurnFramesRef.current = 0;
          if (rightTurnFramesRef.current >= REQUIRED_HOLD_FRAMES) {
            turnedRightRef.current = true;
          }
        } else {
          leftTurnFramesRef.current = 0;
          rightTurnFramesRef.current = 0;
        }

        const movementDuration = performance.now() - movementStartedAtRef.current;
        if (
          !turnedLeftRef.current ||
          !turnedRightRef.current ||
          movementDuration < MINIMUM_MOVEMENT_MS
        ) {
          setStatus("movement-required");
          scheduleNextFrame();
          return;
        }

        successCalledRef.current = true;
        setStatus("match");
        reportFacePerformance({
          event: "match",
          mode,
          descriptorSource,
          totalMs: performance.now() - modalOpenedAtRef.current,
        });
        const captureDataUrl = getCaptureDataUrl();
        stopCamera();
        timeoutRef.current = setTimeout(() => {
          if (cancelled) return;
          if (!captureDataUrl) {
            successCalledRef.current = false;
            setStatus("error");
            return;
          }
          onSuccess(captureDataUrl);
        }, 100);

      };

      detectFrame();
    };

    run();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [isOpen, mode, modelsLoaded, referenceDescriptor, referenceImageUrl, onSuccess, cleanup, getCaptureDataUrl, stopCamera]);

  if (!isOpen) return null;

  const statusConfig: Record<
    ScanStatus,
    { label: string; color: string; icon: React.ReactNode }
  > = {
    "loading-models": {
      label: "Memuat model AI...",
      color: "text-blue-400",
      icon: <Loader2 className="w-5 h-5 animate-spin" />,
    },
    "loading-reference": {
      label: "Memuat foto referensi...",
      color: "text-blue-400",
      icon: <Loader2 className="w-5 h-5 animate-spin" />,
    },
    scanning: {
      label: "Mendeteksi wajah...",
      color: "text-yellow-400",
      icon: <ScanFace className="w-5 h-5 animate-pulse" />,
    },
    "position-required": {
      label: "Posisikan wajah lebih dekat dan di tengah frame",
      color: "text-orange-400",
      icon: <Camera className="w-5 h-5" />,
    },
    "movement-required": {
      label: "Gerakkan kepala ke kanan dan kiri",
      color: "text-indigo-400",
      icon: <ScanFace className="w-5 h-5 animate-pulse" />,
    },
    "glasses-detected": {
      label: "Kacamata terdeteksi! Harap lepas kacamata Anda",
      color: "text-red-400",
      icon: <XCircle className="w-5 h-5" />,
    },
    "no-face": {
      label: "Wajah tidak terdeteksi, posisikan wajah Anda",
      color: "text-orange-400",
      icon: <Camera className="w-5 h-5" />,
    },
    "no-reference": {
      label: "Foto referensi tidak ada — hubungi admin untuk mendaftarkan wajah",
      color: "text-red-400",
      icon: <XCircle className="w-5 h-5" />,
    },
    "no-match": {
      label: "Wajah tidak cocok, coba lagi",
      color: "text-red-400",
      icon: <XCircle className="w-5 h-5" />,
    },
    match: {
      label: "Wajah cocok! ✅",
      color: "text-green-400",
      icon: <CheckCircle className="w-5 h-5" />,
    },
    error: {
      label: "Gagal memuat model AI",
      color: "text-red-400",
      icon: <XCircle className="w-5 h-5" />,
    },
    "no-camera": {
      label: "Kamera tidak tersedia",
      color: "text-red-400",
      icon: <XCircle className="w-5 h-5" />,
    },
  };

  const cfg = statusConfig[status];
  const modeLabel =
    mode === "check-in"
      ? "Check In"
      : mode === "check-out"
        ? "Check Out"
        : mode === "break-in"
          ? "Break Check In"
          : "Break Check Out";
  const shouldSuppressStatusUi = showStartupSplash;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-[95%] sm:max-w-md md:max-w-lg overflow-hidden transition-all duration-300">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <ScanFace className="w-5 h-5 text-indigo-400" />
            <h2 className="text-white font-semibold text-sm sm:text-base">
              Verifikasi Wajah – {modeLabel}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative aspect-[4/5] overflow-hidden bg-black sm:aspect-[4/3]">
          <video
            ref={videoRef}
            className="absolute inset-0 block min-h-full min-w-full object-cover object-center"
            style={{
              width: "100%",
              height: "100%",
              transform: "scaleX(-1)",
              WebkitTransform: "scaleX(-1)",
            }}
            muted
            playsInline
            autoPlay
          />

          {!shouldSuppressStatusUi &&
            (status === "scanning" ||
              status === "no-face" ||
              status === "no-match" ||
              status === "position-required" ||
              status === "movement-required") && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`aspect-[3/4] w-[58%] max-w-56 rounded-[48%] border-[3px] transition-colors sm:w-48 ${
                    status === "no-face"
                      ? "border-orange-400"
                      : status === "no-match"
                        ? "border-red-400"
                        : status === "position-required"
                          ? "border-orange-300 shadow-[0_0_18px_rgba(251,146,60,0.8)]"
                        : status === "movement-required"
                          ? "border-indigo-300 shadow-[0_0_18px_rgba(129,140,248,0.8)]"
                          : "border-indigo-400"
                  }`}
                />
              </div>
            )}

          {!shouldSuppressStatusUi && status === "position-required" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3">
              <div className="rounded-full bg-orange-600/90 px-4 py-2 text-center text-xs font-bold text-white shadow-lg backdrop-blur-sm sm:text-sm">
                DEKATKAN WAJAH KE TENGAH FRAME
              </div>
            </div>
          )}

          {!shouldSuppressStatusUi && status === "movement-required" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3">
              <div className="rounded-full bg-indigo-600/90 px-4 py-2 text-center text-xs font-bold text-white shadow-lg backdrop-blur-sm sm:text-sm">
                GERAKKAN KEPALA KE KANAN DAN KIRI
              </div>
            </div>
          )}

          {showStartupSplash && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 backdrop-blur-[2px]">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-2xl">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-white">
                    Menyiapkan verifikasi wajah
                  </span>
                  <span className="text-xs text-gray-300">
                    Sedang memuat kamera dan model AI...
                  </span>
                </div>
              </div>
            </div>
          )}

          {!shouldSuppressStatusUi && status === "match" && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-900/60">
              <CheckCircle className="w-20 h-20 text-green-400 drop-shadow-lg" />
            </div>
          )}

          {!shouldSuppressStatusUi && (status === "loading-models" || status === "loading-reference") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 gap-3">
              <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
              <p className="text-gray-300 text-sm">{cfg.label}</p>
            </div>
          )}

          {!shouldSuppressStatusUi && (status === "no-camera" || status === "error") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 gap-3">
              <Camera className="w-12 h-12 text-gray-500" />
              <p className="text-gray-400 text-sm text-center px-6">{cfg.label}</p>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-2 sm:py-3 bg-gray-800/60 border-t border-gray-700">
          <div className={`flex items-center gap-2 ${cfg.color}`}>
            {!shouldSuppressStatusUi && (
              <>
                {cfg.icon}
                <span className="text-xs sm:text-sm font-medium line-clamp-1">{cfg.label}</span>
                {matchScore !== null && status === "no-match" && (
                  <span className="ml-auto text-[10px] sm:text-xs text-gray-400 whitespace-nowrap">
                    Sim: {(matchScore * 100).toFixed(0)}%
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-5 py-3 sm:py-4 flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Button
            variant="ghost"
            className="w-full sm:flex-1 text-gray-400 hover:text-white hover:bg-gray-700 text-xs sm:text-sm h-9 sm:h-10"
            onClick={onClose}
          >
            Batal
          </Button>
        </div>

        <p className="text-center text-[10px] sm:text-xs text-gray-500 pb-3 sm:pb-4 px-4 sm:px-5">
          Pastikan wajah terlihat jelas dan pencahayaan cukup
        </p>
      </div>
    </div>
  );
}
