export async function renderPdfPages(
  url: string,
  signal: AbortSignal,
  onPage?: (images: string[]) => void,
): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  signal.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker.legacy.min.mjs?v=${pdfjs.version}`;

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Gagal memuat lampiran PDF");
  const data = new Uint8Array(await response.arrayBuffer());
  signal.throwIfAborted();
  const task = pdfjs.getDocument({
    data,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
  });
  const destroy = () => { void task.destroy().catch(() => {}); };
  signal.addEventListener("abort", destroy, { once: true });
  try {
    const pdf = await task.promise;
    const images: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      signal.throwIfAborted();
      const page = await pdf.getPage(pageNumber);
      const size = page.getViewport({ scale: 1 });
      const scale = Math.min(1600 / size.width, 2400 / size.height);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({ canvas, viewport, background: "#ffffff" }).promise;
        images.push(canvas.toDataURL("image/jpeg", 0.92));
        onPage?.([...images]);
      } finally {
        canvas.width = canvas.height = 0;
        page.cleanup();
      }
    }
    return images;
  } finally {
    signal.removeEventListener("abort", destroy);
    destroy();
  }
}
