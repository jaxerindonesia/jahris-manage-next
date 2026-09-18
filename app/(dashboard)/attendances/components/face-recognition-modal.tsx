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
  | "head-turn-required"
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const referenceDescriptorRef = useRef<Float32Array | null>(null);
  const referenceKeyRef = useRef<string | null>(null);
  const successCalledRef = useRef(false);
  const modalOpenedAtRef = useRef(0);

  // Head-turn liveness state
  const turnedLeftFramesRef = useRef(0);
  const turnedRightFramesRef = useRef(0);
  const turnedLeftDoneRef = useRef(false);
  const turnedRightDoneRef = useRef(false);
  const headTurnPassedRef = useRef(false);

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
    const snapshotCanvas = document.createElement("canvas");
    snapshotCanvas.width = video.videoWidth;
    snapshotCanvas.height = video.videoHeight;
    const ctx = snapshotCanvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
    return snapshotCanvas.toDataURL("image/jpeg", 0.9);
  }, []);

  const cleanup = useCallback(() => {
    stopCamera();
    successCalledRef.current = false;
    turnedLeftFramesRef.current = 0;
    turnedRightFramesRef.current = 0;
    turnedLeftDoneRef.current = false;
    turnedRightDoneRef.current = false;
    headTurnPassedRef.current = false;
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

      const detectFrame = async () => {
        if (!videoRef.current || cancelled || successCalledRef.current) return;

        const detection = await faceapi
          .detectSingleFace(
            videoRef.current,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }),
          )
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (canvasRef.current && videoRef.current) {
          const dims = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
          const ctx = canvasRef.current.getContext("2d");
          ctx?.clearRect(0, 0, dims.width, dims.height);
          if (detection) {
            const resized = faceapi.resizeResults(detection, dims);
            faceapi.draw.drawDetections(canvasRef.current, [resized]);
            faceapi.draw.drawFaceLandmarks(canvasRef.current, [resized]);
          }
        }

        if (!detection) {
          if (!cancelled) setStatus("no-face");
          timeoutRef.current = setTimeout(detectFrame, 200);
          return;
        }

        if (!referenceDescriptorRef.current) {
          if (!cancelled) setStatus("no-reference");
          timeoutRef.current = setTimeout(detectFrame, 200);
          return;
        }

        const distance = faceapi.euclideanDistance(
          detection.descriptor,
          referenceDescriptorRef.current,
        );
        const score = Math.max(0, 1 - distance);
        setMatchScore(score);

        if (distance <= 0.45) {
          const landmarks = detection.landmarks;
          const nose = landmarks.getNose();
          const leftEye = landmarks.getLeftEye();
          const rightEye = landmarks.getRightEye();

          const noseTip = nose[3];
          const leftEyeCenterX = leftEye.reduce((sum, p) => sum + p.x, 0) / leftEye.length;
          const rightEyeCenterX = rightEye.reduce((sum, p) => sum + p.x, 0) / rightEye.length;
          const eyeCenterX = (leftEyeCenterX + rightEyeCenterX) / 2;
          const eyeDistance = Math.max(Math.abs(rightEyeCenterX - leftEyeCenterX), 1);
          const yawRatio = (noseTip.x - eyeCenterX) / eyeDistance;

          // Lower threshold so smaller head turns are accepted faster.
          const TURN_THRESHOLD = 0.08;
          const REQUIRED_TURN_FRAMES = 1;

          if (yawRatio >= TURN_THRESHOLD) {
            turnedRightFramesRef.current += 1;
            turnedLeftFramesRef.current = Math.max(0, turnedLeftFramesRef.current - 1);
          } else if (yawRatio <= -TURN_THRESHOLD) {
            turnedLeftFramesRef.current += 1;
            turnedRightFramesRef.current = Math.max(0, turnedRightFramesRef.current - 1);
          } else {
            turnedLeftFramesRef.current = Math.max(0, turnedLeftFramesRef.current - 1);
            turnedRightFramesRef.current = Math.max(0, turnedRightFramesRef.current - 1);
          }

          if (turnedLeftFramesRef.current >= REQUIRED_TURN_FRAMES) {
            turnedLeftDoneRef.current = true;
          }
          if (turnedRightFramesRef.current >= REQUIRED_TURN_FRAMES) {
            turnedRightDoneRef.current = true;
          }

          headTurnPassedRef.current = turnedLeftDoneRef.current && turnedRightDoneRef.current;

          if (!headTurnPassedRef.current) {
            if (!cancelled) setStatus("head-turn-required");
            timeoutRef.current = setTimeout(detectFrame, 200);
            return;
          }

          if (!cancelled && !successCalledRef.current) {
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
            setTimeout(() => {
              if (!captureDataUrl) {
                successCalledRef.current = false;
                setStatus("error");
                return;
              }
              onSuccess(captureDataUrl);
            }, 1200);
          }
        } else {
          turnedLeftFramesRef.current = 0;
          turnedRightFramesRef.current = 0;
          if (!cancelled) setStatus("no-match");
          timeoutRef.current = setTimeout(detectFrame, 200);
        }
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
    "head-turn-required": {
      label: "Wajah dikenali! Putar kepala ke kanan dan kiri",
      color: "text-indigo-400",
      icon: <ScanFace className="w-5 h-5 animate-bounce" />,
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
            className="h-full w-full -scale-x-100 object-contain object-center"
            muted
            playsInline
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full -scale-x-100 object-contain object-center"
          />

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

          {!shouldSuppressStatusUi && (status === "scanning" || status === "no-face" || status === "no-match" || status === "head-turn-required") && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className={`aspect-[3/4] w-[58%] max-w-56 rounded-full border-4 transition-colors duration-500 sm:w-48 ${
                  status === "no-match"
                    ? "border-red-400"
                    : status === "no-face"
                      ? "border-orange-400 opacity-60"
                      : status === "head-turn-required"
                        ? "border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)]"
                        : "border-indigo-400 opacity-70"
                }`}
                style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}
              />
              {status === "head-turn-required" && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
                  <div className="bg-indigo-600 text-white px-4 py-2 rounded-full text-xs sm:text-sm font-bold animate-pulse shadow-lg whitespace-nowrap">
                    PUTAR KEPALA KANAN DAN KIRI
                  </div>
                </div>
              )}
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
