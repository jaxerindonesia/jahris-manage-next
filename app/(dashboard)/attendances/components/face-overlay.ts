type Point = { x: number; y: number };
type FaceOutline = {
  points: Point[];
  box: { x: number; y: number; width: number; height: number };
};

const paths = [
  [0, 16, false], [17, 21, false], [22, 26, false],
  [27, 30, false], [31, 35, false], [36, 41, true],
  [42, 47, true], [48, 59, true], [60, 67, true],
] as const;

export function createFaceOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  const ctx = canvas.getContext("2d");
  let target: FaceOutline | null = null;
  let displayed: FaceOutline | null = null;
  let updatedAt = 0;
  let previousFrame = 0;
  let frameId = 0;
  let stopped = false;

  const draw = (now: number) => {
    if (stopped) return;
    frameId = requestAnimationFrame(draw);
    if (!ctx || !video.videoWidth || !video.videoHeight) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      displayed = null;
    }

    const elapsed = previousFrame ? Math.min(now - previousFrame, 50) : 16;
    previousFrame = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!target || now - updatedAt > 300) {
      displayed = null;
      return;
    }

    // Responsive exponential smoothing (time constant 18ms -> buttery smooth without lag or jitter)
    const alpha = 1 - Math.exp(-elapsed / 18);

    if (!displayed) {
      displayed = {
        points: target.points.map((p) => ({ ...p })),
        box: { ...target.box },
      };
    } else {
      displayed.points.forEach((p, i) => {
        p.x += (target!.points[i].x - p.x) * alpha;
        p.y += (target!.points[i].y - p.y) * alpha;
      });
      for (const key of ["x", "y", "width", "height"] as const) {
        displayed.box[key] += (target!.box[key] - displayed.box[key]) * alpha;
      }
    }

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#6366f1";
    const box = displayed.box;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#22c55e";
    for (const [start, end, closed] of paths) {
      ctx.beginPath();
      for (let i = start; i <= end; i++) {
        const point = displayed.points[i];
        if (i === start) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      if (closed) ctx.closePath();
      ctx.stroke();
    }

    ctx.fillStyle = "#e879f9";
    for (const point of displayed.points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  frameId = requestAnimationFrame(draw);

  return {
    update(outline: FaceOutline | null) {
      if (stopped) return;
      target = outline;
      if (outline) {
        updatedAt = performance.now();
      }
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(frameId);
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
