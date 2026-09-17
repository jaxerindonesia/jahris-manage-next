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
import { createFaceOverlay } from "./face-overlay";

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
  const [retryCount, setRetryCount] = useState(0);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<ReturnType<typeof createFaceOverlay> | null>(null);
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
  const faceMatchedRef = useRef(false);
  const consecutiveNoFaceRef = useRef(0);

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
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    overlayRef.current?.stop();
    overlayRef.current = null;
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
    faceMatchedRef.current = false;
    consecutiveNoFaceRef.current = 0;
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
    let cancelled = false;
    const load = async () => {
      try {
        await ensureFaceModelLoaded("attendance-recognition", [
          () => faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          () => faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
          () => faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
        ]);
        if (!cancelled) setModelsLoaded(true);
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    load();
    return () => { cancelled = true; };
  }, [modelsLoaded, retryCount]);

  useEffect(() => {
    if (!isOpen) return;
    if (!modelsLoaded) return;

    let cancelled = false;
    let lastProgressAt = performance.now();
    let lastVideoTime = -1;
    let lastFrameAt = performance.now();
    let cameraStarted = false;
    const watchdog = window.setInterval(() => {
      if (cancelled || successCalledRef.current || document.hidden) return;
      const video = videoRef.current;
      const now = performance.now();
      if (video && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        lastFrameAt = now;
      }
      const frozen = cameraStarted && now - lastFrameAt > 8000;
      if (now - lastProgressAt > 20000 || frozen) {
        cancelled = true;
        stopCamera();
        setStatus(frozen ? "no-camera" : "error");
      }
    }, 1000);
    const resumeCamera = () => {
      lastProgressAt = performance.now();
      lastFrameAt = performance.now();
      if (!document.hidden && !cancelled && streamRef.current) {
        void videoRef.current?.play().catch(() => {
          if (!cancelled) {
            cancelled = true;
            stopCamera();
            setStatus("no-camera");
          }
        });
      }
    };
    document.addEventListener("visibilitychange", resumeCamera);

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
        window.clearInterval(watchdog);
        setStatus("no-reference");
        return;
      }

      const loadReference = async () => {
        if (referenceDescriptorRef.current || !referenceImageUrl) return;
        setStatus("loading-reference");
        try {
          const descriptor = await loadAndCacheFaceDescriptor(referenceImageUrl);
          if (!cancelled) referenceDescriptorRef.current = descriptor;
        } catch {
          if (!cancelled) referenceDescriptorRef.current = null;
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

          const video = videoRef.current;
          if (!video) throw new Error("Camera preview unavailable");
          video.muted = true;
          video.playsInline = true;
          video.srcObject = stream;
          await video.play();
          if (cancelled) return null;
          cameraStarted = true;
          lastFrameAt = performance.now();
          lastProgressAt = performance.now();
          return performance.now() - startedAt;
        } catch {
          if (!cancelled) {
            window.clearInterval(watchdog);
            stopCamera();
            setStatus("no-camera");
          }
          return null;
        }
      };

      if (referenceDescriptorRef.current) setStatus("scanning");
      const referenceStartedAt = performance.now();
      const [, cameraMs] = await Promise.all([loadReference(), startCamera()]);
      const referenceMs = performance.now() - referenceStartedAt;

      if (cancelled) return;

      if (!referenceDescriptorRef.current) {
        window.clearInterval(watchdog);
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
      if (canvasRef.current && videoRef.current) {
        overlayRef.current = createFaceOverlay(canvasRef.current, videoRef.current);
      }
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
      let noFaceSince: number | null = null;
      const detectFrame = async () => {
        if (!videoRef.current || cancelled || successCalledRef.current) return;
        const frameStartedAt = performance.now();
        const scheduleNextFrame = () => {
          if (cancelled || successCalledRef.current) return;
          // Allow rendering between scans without adding a full delay after inference.
          const delay = Math.max(0, 33 - (performance.now() - frameStartedAt));
          timeoutRef.current = setTimeout(() => void detectFrame(), delay);
        };
        if (document.hidden || videoRef.current.paused || !videoRef.current.videoWidth || !videoRef.current.videoHeight || videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          scheduleNextFrame();
          return;
        }

        let detection;
        try {
          if (!scanContext) throw new Error("Camera canvas unavailable");
          const video = videoRef.current;
          if (scanCanvas.width !== video.videoWidth || scanCanvas.height !== video.videoHeight) {
            scanCanvas.width = video.videoWidth;
            scanCanvas.height = video.videoHeight;
          }
          scanContext.drawImage(video, 0, 0);
          detection = await faceapi
            .detectSingleFace(
              scanCanvas,
              new faceapi.TinyFaceDetectorOptions({
                inputSize: consecutiveNoFaceRef.current >= 3 ? 416 : 224,
                scoreThreshold: 0.3,
              }),
            )
            .withFaceLandmarks();
        } catch {
          if (!cancelled) {
            window.clearInterval(watchdog);
            setStatus("error");
            stopCamera();
          }
          return;
        }
        if (cancelled || successCalledRef.current) return;

        lastProgressAt = performance.now();
        overlayRef.current?.update(detection ? {
          points: detection.landmarks.positions.map(({ x, y }) => ({ x, y })),
          box: detection.detection.box,
        } : null);

        if (!detection) {
          consecutiveNoFaceRef.current += 1;
          noFaceSince ??= performance.now();
          if (performance.now() - noFaceSince > 1500) {
            faceMatchedRef.current = false;
            turnedLeftDoneRef.current = false;
            turnedRightDoneRef.current = false;
            headTurnPassedRef.current = false;
            if (!cancelled) setStatus("no-face");
          }
          scheduleNextFrame();
          return;
        }

        consecutiveNoFaceRef.current = 0;
        noFaceSince = null;

        if (!referenceDescriptorRef.current) {
          if (!cancelled) setStatus("no-reference");
          scheduleNextFrame();
          return;
        }

        // ==========================================
        // PHASE 1: IDENTITY VERIFICATION
        // Compute descriptor ONCE until match is confirmed
        // ==========================================
        if (!faceMatchedRef.current) {
          if (performance.now() - lastIdentityCheckAt < 250) {
            scheduleNextFrame();
            return;
          }
          lastIdentityCheckAt = performance.now();

          let verified;
          try {
            verified = await new faceapi.ComputeSingleFaceDescriptorTask(
              Promise.resolve(detection), scanCanvas,
            );
          } catch {
            if (!cancelled) {
              window.clearInterval(watchdog);
              setStatus("error");
              stopCamera();
            }
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

          if (distance <= 0.48) {
            faceMatchedRef.current = true;
            turnedLeftDoneRef.current = false;
            turnedRightDoneRef.current = false;
            headTurnPassedRef.current = false;
            if (!cancelled) setStatus("head-turn-required");
          } else {
            setMatchScore(Math.round(score * 100) / 100);
            if (!cancelled) setStatus("no-match");
          }
          scheduleNextFrame();
          return;
        }

        // ==========================================
        // PHASE 2: LIVENESS (HEAD TURN)
        // Ultra-fast: Only tracks landmarks, NO descriptor blocking!
        // ==========================================
        if (!cancelled) {
          setStatus("head-turn-required");
        }

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

        // Natural and comfortable turn threshold
        const TURN_THRESHOLD = 0.06;

        if (yawRatio >= TURN_THRESHOLD) {
          turnedRightDoneRef.current = true;
        } else if (yawRatio <= -TURN_THRESHOLD) {
          turnedLeftDoneRef.current = true;
        }

        headTurnPassedRef.current = turnedLeftDoneRef.current && turnedRightDoneRef.current;

        if (!headTurnPassedRef.current) {
          scheduleNextFrame();
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
          timeoutRef.current = setTimeout(() => {
            if (cancelled) return;
            if (!captureDataUrl) {
              successCalledRef.current = false;
              setStatus("error");
              return;
            }
            onSuccessRef.current(captureDataUrl);
          }, 300);
        }
      };

      detectFrame();
    };

    run();

    return () => {
      cancelled = true;
      window.clearInterval(watchdog);
      document.removeEventListener("visibilitychange", resumeCamera);
      cleanup();
    };
  }, [isOpen, mode, modelsLoaded, referenceDescriptor, referenceImageUrl, retryCount, cleanup, getCaptureDataUrl, stopCamera]);

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
      label: "Pemindaian terhenti. Silakan coba lagi",
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
            className="absolute inset-0 h-full w-full -scale-x-100 object-contain object-center"
            autoPlay
            muted
            playsInline
          />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-contain object-center"
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
          {(status === "no-camera" || status === "error" || status === "no-face") && (
            <Button
              className="w-full sm:flex-1"
              onClick={() => {
                cleanup();
                setRetryCount((count) => count + 1);
              }}
            >
              Coba lagi
            </Button>
          )}
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
