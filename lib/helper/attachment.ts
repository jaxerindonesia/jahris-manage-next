export function isPdfUrl(url: string) {
  return /\.pdf(?:$|[?#])/i.test(url);
}

export function normalizeAttachmentType(url: string) {
  if (isPdfUrl(url)) return "PDF";
  if (/\.(png|jpg|jpeg|webp|gif)(?:$|[?#])/i.test(url)) return "Foto";
  return "Link";
}

export const TASK_ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024;
export const TASK_ATTACHMENT_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".pdf",
  ".xls",
  ".xlsx",
  ".csv",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
];

export function safeAttachmentName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

export function isAllowedTaskAttachment(fileName: string) {
  const lower = fileName.toLowerCase();
  return TASK_ATTACHMENT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function inferTaskAttachmentKind(fileName: string, mimeType: string) {
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) return "PDF";
  if (mimeType.startsWith("image/")) return "Foto";
  return "File";
}
