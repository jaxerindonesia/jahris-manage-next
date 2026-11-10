export function isPdfUrl(url: string) {
  return /\.pdf(?:$|[?#])/i.test(url);
}

export function normalizeAttachmentType(url: string) {
  if (isPdfUrl(url)) return "PDF";
  if (/\.(png|jpg|jpeg|webp|gif)(?:$|[?#])/i.test(url)) return "Foto";
  return "Link";
}
