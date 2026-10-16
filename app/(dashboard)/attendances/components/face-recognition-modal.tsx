"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle, RotateCcw, ScanFace, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { attachCameraStream, isRetryableCameraError, releaseCameraStream } from "@/lib/helper/camera-stream";

const CAMERA_START_ATTEMPTS = 3;
const SERVER_VERIFICATION_TIMEOUT_MS = 40_000;

interface FaceRecognitionModalProps {
  isOpen: boolean;
  mode: "check-in" | "check-out" | "break-in" | "break-out";
  onSuccess: (captureDataUrl: string, verificationToken: string) => void;
  onClose: () => void;
  onCameraPreparingChange?: (preparing: boolean) => void;
}

type ScanStatus =
  | "starting-camera"
  | "center"
  | "move-head"
  | "verifying"
  | "match"
  | "no-face"
  | "position"
  | "movement"
  | "no-match"
  | "no-reference"
  | "error"
  | "no-camera";

type VerifyResponse = {
  ok?: boolean;
  reason?: "no-reference" | "no-face" | "position" | "no-match" | "movement";
  message?: string;
  score?: number;
  verificationToken?: string;
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function FaceRecognitionModal({ isOpen, mode, onSuccess, onClose, onCameraPreparingChange }: FaceRecognitionModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<ScanStatus>("starting-camera");
  const [errorMessage, setErrorMessage] = useState("");
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [cameraRestartKey, setCameraRestartKey] = useState(0);

  const stopCamera = useCallback(() => {
    releaseCameraStream(videoRef.current, streamRef.current);
    streamRef.current = null;
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return "";
    const scale = Math.min(1, 480 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const startCamera = async () => {
      let lastError: unknown = null;
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new DOMException("Browser tidak mendukung akses kamera", "NotSupportedError");
      }
      for (let attempt = 0; attempt < CAMERA_START_ATTEMPTS; attempt += 1) {
        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: attempt === 0
              ? {
                  facingMode: { ideal: "user" },
                  width: { ideal: 640 },
                  height: { ideal: 480 },
                  frameRate: { ideal: 24, max: 30 },
                  aspectRatio: { ideal: 4 / 3 },
                }
              : { facingMode: "user" },
          });
          if (cancelled) {
            releaseCameraStream(videoRef.current, stream);
            return false;
          }
          streamRef.current = stream;
          if (!videoRef.current) throw new Error("Camera preview is unavailable");
          await attachCameraStream(videoRef.current, stream);
          return true;
        } catch (error) {
          lastError = error;
          releaseCameraStream(videoRef.current, stream);
          if (streamRef.current === stream) streamRef.current = null;
          if (cancelled || !isRetryableCameraError(error) || attempt === CAMERA_START_ATTEMPTS - 1) break;
          await wait(250 * (attempt + 1));
        }
      }
      throw lastError instanceof Error ? lastError : new Error("Kamera belum berhasil dimulai");
    };

    const run = async () => {
      setErrorMessage("");
      setMatchScore(null);
      setStatus("starting-camera");
      onCameraPreparingChange?.(true);
      try {
        if (!(await startCamera()) || cancelled) return;

        // attachCameraStream resolves only after a real frame is available, so
        // reveal the preview immediately and keep the frontend sequence short.
        onCameraPreparingChange?.(false);
        setStatus("center");
        await wait(1_200);
        if (cancelled) return;
        const centerFrames = [captureFrame()];
        await wait(250);
        if (cancelled) return;
        centerFrames.push(captureFrame());

        setStatus("move-head");
        await wait(1_400);
        if (cancelled) return;
        const movementFrame = captureFrame();

        if (centerFrames.some((frame) => !frame) || !movementFrame) {
          throw new Error("Kamera belum menghasilkan gambar. Silakan coba lagi.");
        }

        setStatus("verifying");
        const controller = new AbortController();
        requestAbortRef.current = controller;
        const timeoutId = window.setTimeout(
          () => controller.abort("server-timeout"),
          SERVER_VERIFICATION_TIMEOUT_MS,
        );
        let response: Response;
        try {
          response = await fetch("/api/face-recognition/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ frames: [...centerFrames, movementFrame], mode }),
            signal: controller.signal,
          });
        } catch (error) {
          if (controller.signal.reason === "server-timeout") {
            throw new Error("Verifikasi wajah di server terlalu lama. Silakan coba lagi.");
          }
          throw error;
        } finally {
          window.clearTimeout(timeoutId);
          if (requestAbortRef.current === controller) requestAbortRef.current = null;
        }
        const result = (await response.json().catch(() => ({}))) as VerifyResponse;
        if (cancelled) return;
        stopCamera();

        if (!response.ok || !result.ok) {
          const nextStatus: ScanStatus = result.reason === "no-reference"
            ? "no-reference"
            : result.reason === "no-face"
              ? "no-face"
              : result.reason === "position"
                ? "position"
                : result.reason === "movement"
                  ? "movement"
                  : result.reason === "no-match"
                    ? "no-match"
                    : "error";
          setMatchScore(typeof result.score === "number" ? result.score : null);
          setErrorMessage(result.message || "Verifikasi wajah gagal. Silakan coba lagi.");
          setStatus(nextStatus);
          return;
        }

        if (!result.verificationToken) throw new Error("Token verifikasi wajah tidak diterima.");
        setMatchScore(typeof result.score === "number" ? result.score : null);
        setStatus("match");
        await wait(350);
        if (!cancelled) onSuccess(centerFrames[0], result.verificationToken);
      } catch (error) {
        if (cancelled) return;
        onCameraPreparingChange?.(false);
        const errorName = error instanceof DOMException ? error.name : "";
        const isCameraError = ["NotAllowedError", "SecurityError", "NotFoundError", "NotSupportedError", "TimeoutError"].includes(errorName);
        setErrorMessage(
          errorName === "NotAllowedError" || errorName === "SecurityError"
            ? "Izin kamera ditolak. Izinkan kamera di pengaturan browser lalu coba lagi."
            : errorName === "NotFoundError"
              ? "Kamera depan tidak ditemukan pada perangkat ini."
              : error instanceof Error
                ? error.message
                : "Verifikasi wajah gagal. Silakan coba lagi.",
        );
        setStatus(isCameraError ? "no-camera" : "error");
        stopCamera();
      }
    };

    void run();
    return () => {
      cancelled = true;
      onCameraPreparingChange?.(false);
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
      stopCamera();
    };
  }, [cameraRestartKey, captureFrame, isOpen, mode, onCameraPreparingChange, onSuccess, stopCamera]);

  if (!isOpen) return null;

  const statusConfig: Record<ScanStatus, { label: string; color: string; icon: React.ReactNode }> = {
    "starting-camera": { label: "", color: "", icon: null },
    center: { label: "Lihat lurus ke kamera", color: "text-indigo-300", icon: <ScanFace className="h-5 w-5 animate-pulse" /> },
    "move-head": { label: "Gerakkan kepala sedikit ke kiri atau kanan", color: "text-indigo-300", icon: <ScanFace className="h-5 w-5 animate-pulse" /> },
    verifying: { label: "Wajah sudah diambil, sedang mengecek...", color: "text-blue-400", icon: <ScanFace className="h-5 w-5 animate-pulse" /> },
    match: { label: "Wajah cocok!", color: "text-green-400", icon: <CheckCircle className="h-5 w-5" /> },
    "no-face": { label: errorMessage, color: "text-orange-400", icon: <Camera className="h-5 w-5" /> },
    position: { label: errorMessage, color: "text-orange-400", icon: <Camera className="h-5 w-5" /> },
    movement: { label: errorMessage, color: "text-orange-400", icon: <ScanFace className="h-5 w-5" /> },
    "no-match": { label: errorMessage, color: "text-red-400", icon: <XCircle className="h-5 w-5" /> },
    "no-reference": { label: errorMessage, color: "text-red-400", icon: <XCircle className="h-5 w-5" /> },
    error: { label: errorMessage, color: "text-red-400", icon: <XCircle className="h-5 w-5" /> },
    "no-camera": { label: errorMessage, color: "text-red-400", icon: <Camera className="h-5 w-5" /> },
  };
  const cfg = statusConfig[status];
  const isCapturing = status === "center" || status === "move-head";
  const canRetry = ["no-face", "position", "movement", "no-match", "error", "no-camera"].includes(status);
  const isFailure = canRetry || status === "no-reference";
  const modeLabel = mode === "check-in" ? "Check In" : mode === "check-out" ? "Check Out" : mode === "break-in" ? "Break Check In" : "Break Check Out";

  return (
    <div className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:p-6 ${status === "starting-camera" ? "pointer-events-none opacity-0" : "opacity-100"}`}>
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl sm:max-w-md md:max-w-lg">
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2">
            <ScanFace className="h-5 w-5 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white sm:text-base">Verifikasi Wajah – {modeLabel}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative isolate aspect-[4/5] w-full overflow-hidden bg-black sm:aspect-[4/3]">
          <video ref={videoRef} className="absolute inset-0 block h-full w-full object-contain object-center" style={{ transform: "scaleX(-1)", WebkitTransform: "scaleX(-1)" }} muted playsInline autoPlay />

          {isCapturing && (
            <>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="aspect-[3/4] w-[58%] max-w-56 rounded-[48%] border-[3px] border-indigo-300 shadow-[0_0_18px_rgba(129,140,248,0.8)] sm:w-48" />
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3">
                <div className="rounded-full bg-indigo-600/90 px-4 py-2 text-center text-xs font-bold text-white shadow-lg backdrop-blur-sm sm:text-sm">{cfg.label.toUpperCase()}</div>
              </div>
            </>
          )}

          {status === "match" && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-900/60">
              <CheckCircle className="h-20 w-20 text-green-400 drop-shadow-lg" />
            </div>
          )}
          {isFailure && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900/95 px-6">
              <XCircle className="h-12 w-12 text-red-400" />
              <p className="text-center text-sm text-gray-300">{cfg.label}</p>
              {canRetry && (
                <Button type="button" size="sm" onClick={() => setCameraRestartKey((value) => value + 1)} className="gap-2">
                  <RotateCcw className="h-4 w-4" /> Coba Lagi
                </Button>
              )}
            </div>
          )}
        </div>

        {status !== "starting-camera" && (
          <div className="border-t border-gray-700 bg-gray-800/60 px-4 py-2 sm:px-5 sm:py-3">
            <div className={`flex items-center gap-2 ${cfg.color}`}>
              {cfg.icon}
              <span className="line-clamp-2 text-xs font-medium sm:text-sm">{cfg.label}</span>
              {matchScore !== null && status === "no-match" && <span className="ml-auto whitespace-nowrap text-[10px] text-gray-400 sm:text-xs">Sim: {(matchScore * 100).toFixed(0)}%</span>}
            </div>
          </div>
        )}
        <div className="flex px-4 py-3 sm:px-5 sm:py-4">
          <Button variant="ghost" className="w-full text-xs text-gray-400 hover:bg-gray-700 hover:text-white sm:text-sm" onClick={onClose}>Batal</Button>
        </div>
        <p className="px-4 pb-3 text-center text-[10px] text-gray-500 sm:px-5 sm:pb-4 sm:text-xs">Lihat kamera, lalu gerakkan kepala sedikit ke salah satu sisi</p>
      </div>
    </div>
  );
}
