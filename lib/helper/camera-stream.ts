const VIDEO_READY_TIMEOUT_MS = 3_500;

function getCameraError(message: string, name = "CameraError") {
  return new DOMException(message, name);
}

export function isIOSWebKit() {
  if (typeof navigator === "undefined") return false;

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function releaseCameraStream(
  video: HTMLVideoElement | null,
  stream: MediaStream | null,
) {
  if (video) {
    video.pause();
    video.srcObject = null;
    video.removeAttribute("src");
    video.load();
  }

  stream?.getTracks().forEach((track) => track.stop());
}

export function isRetryableCameraError(error: unknown) {
  if (!(error instanceof DOMException)) return true;

  return !["NotAllowedError", "SecurityError", "NotFoundError"].includes(
    error.name,
  );
}

export async function attachCameraStream(
  video: HTMLVideoElement,
  stream: MediaStream,
  timeoutMs = VIDEO_READY_TIMEOUT_MS,
) {
  const track = stream.getVideoTracks()[0];
  if (!track) throw getCameraError("Camera stream has no video track");

  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let playRequested = false;
    const readyEvents = [
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "playing",
      "resize",
      "timeupdate",
    ] as const;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      readyEvents.forEach((eventName) =>
        video.removeEventListener(eventName, checkReady),
      );
      track.removeEventListener("ended", handleEnded);
    };
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const requestPlay = () => {
      if (playRequested) return;
      playRequested = true;
      void video.play().then(checkReady).catch(finish);
    };
    const checkReady = () => {
      if (track.readyState !== "live") {
        finish(
          getCameraError(
            "Camera track ended before video was ready",
            "AbortError",
          ),
        );
        return;
      }

      if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        !video.paused
      ) {
        finish();
        return;
      }

      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) requestPlay();
    };
    const handleEnded = () =>
      finish(getCameraError("Camera track ended", "AbortError"));
    const timeoutId = window.setTimeout(
      () =>
        finish(
          getCameraError(
            "Camera did not produce a video frame",
            "TimeoutError",
          ),
        ),
      timeoutMs,
    );

    readyEvents.forEach((eventName) =>
      video.addEventListener(eventName, checkReady),
    );
    track.addEventListener("ended", handleEnded, { once: true });
    video.srcObject = stream;
    requestPlay();
    checkReady();
  });
}
