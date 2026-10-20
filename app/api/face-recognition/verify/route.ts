export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/tenant";
import { validateBase64Image } from "@/lib/security/file-validation";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import {
  verifyFaceOnServer,
  warmFaceRecognitionServer,
} from "@/lib/server/face-recognition";
import {
  createFaceVerificationToken,
  type FaceVerificationMode,
} from "@/lib/server/face-verification-token";

const FRAME_COUNT = 4;
const MAX_FRAME_BYTES = 700 * 1024;
const ALLOWED_MODES = new Set<FaceVerificationMode>([
  "check-in",
  "check-out",
  "break-in",
  "break-out",
]);

export async function GET() {
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;

  try {
    await warmFaceRecognitionServer(auth.user.avatarUrl);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Unable to warm face-recognition models", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "Komponen verifikasi wajah di server belum siap." },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  const startedAt = performance.now();
  const auth = await requireSessionUser();
  if (auth.error) return auth.error;

  const rateLimit = await consumeRateLimit({
    key: `face-verify:${auth.user.id}`,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: "Terlalu banyak percobaan verifikasi wajah. Tunggu beberapa saat." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  try {
    const body = await request.json();
    const mode = body.mode as FaceVerificationMode;
    if (!ALLOWED_MODES.has(mode)) {
      return NextResponse.json({ message: "Mode verifikasi tidak valid." }, { status: 400 });
    }
    if (!Array.isArray(body.frames) || body.frames.length !== FRAME_COUNT) {
      return NextResponse.json(
        { message: `Verifikasi membutuhkan tepat ${FRAME_COUNT} gambar.` },
        { status: 400 },
      );
    }

    const frameBuffers: Buffer[] = [];
    for (const frame of body.frames) {
      if (typeof frame !== "string") {
        return NextResponse.json({ message: "Format gambar tidak valid." }, { status: 400 });
      }
      const validation = validateBase64Image(frame, {
        maxBytes: MAX_FRAME_BYTES,
        allowedMimeTypes: ["image/jpeg"],
      });
      if (!validation.ok) {
        return NextResponse.json({ message: validation.message }, { status: 415 });
      }
      frameBuffers.push(validation.buffer);
    }

    const result = await verifyFaceOnServer(
      frameBuffers,
      auth.user.faceDescriptor,
      auth.user.avatarUrl,
    );
    const totalMs = Math.round(performance.now() - startedAt);
    console.info(JSON.stringify({
      timestamp: new Date().toISOString(),
      category: "server_face_recognition",
      userId: auth.user.id,
      tenantId: auth.user.tenantId,
      ok: result.ok,
      reason: result.ok ? null : result.reason,
      score: result.score,
      totalMs,
    }));

    if (!result.ok) {
      const status = result.reason === "no-reference" ? 422 : 401;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json({
      ...result,
      verificationToken: createFaceVerificationToken(auth.user.id, mode),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      category: "server_face_recognition_error",
      userId: auth.user.id,
      tenantId: auth.user.tenantId,
      detail,
      stack: error instanceof Error ? error.stack : null,
    }));
    return NextResponse.json(
      {
        message: "Komponen verifikasi wajah di server belum siap. Silakan coba lagi atau hubungi admin.",
        code: "FACE_VERIFICATION_SERVER_ERROR",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 500 },
    );
  }
}
