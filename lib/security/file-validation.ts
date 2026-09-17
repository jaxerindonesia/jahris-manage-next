type AllowedImageMime = "image/jpeg" | "image/png";

type Base64FilePayload = {
  buffer: Buffer;
  mimeType: string | null;
};

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46];
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];

function hasSignature(buffer: Buffer, signature: number[]) {
  if (buffer.length < signature.length) return false;

  return signature.every((byte, index) => buffer[index] === byte);
}

function parseBase64Payload(base64Data: string): Base64FilePayload {
  const dataUriMatch = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = dataUriMatch?.[1] ?? null;
  const pureBase64 = dataUriMatch?.[2] ?? base64Data;

  return {
    mimeType,
    buffer: Buffer.from(pureBase64, "base64"),
  };
}

export function validateBase64Image(
  base64Data: string,
  options?: {
    maxBytes?: number;
    allowedMimeTypes?: AllowedImageMime[];
  },
) {
  const { buffer, mimeType } = parseBase64Payload(base64Data);
  const maxBytes = options?.maxBytes ?? 5 * 1024 * 1024;
  const allowedMimeTypes = options?.allowedMimeTypes ?? [
    "image/jpeg",
    "image/png",
  ];

  if (!buffer.length) {
    return { ok: false as const, message: "File gambar tidak valid" };
  }

  if (buffer.length > maxBytes) {
    return {
      ok: false as const,
      message: `Ukuran gambar maksimal ${Math.floor(maxBytes / (1024 * 1024))} MB`,
    };
  }

  if (mimeType && !allowedMimeTypes.includes(mimeType as AllowedImageMime)) {
    return {
      ok: false as const,
      message: "Format gambar hanya boleh JPG atau PNG",
    };
  }

  if (hasSignature(buffer, JPEG_SIGNATURE)) {
    return {
      ok: true as const,
      buffer,
      contentType: "image/jpeg",
      extension: "jpg",
    };
  }

  if (hasSignature(buffer, PNG_SIGNATURE)) {
    return {
      ok: true as const,
      buffer,
      contentType: "image/png",
      extension: "png",
    };
  }

  return {
    ok: false as const,
    message: "Signature file gambar tidak sesuai. Hanya JPG atau PNG yang didukung",
  };
}

function getNormalizedExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? `.${match[1]}` : "";
}

export function validateAttachmentBuffer(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
) {
  const extension = getNormalizedExtension(fileName);

  if ([".jpg", ".jpeg"].includes(extension)) {
    if (!hasSignature(buffer, JPEG_SIGNATURE)) {
      return { ok: false as const, message: "File JPG/JPEG tidak valid" };
    }

    return { ok: true as const, contentType: "image/jpeg" };
  }

  if (extension === ".png") {
    if (!hasSignature(buffer, PNG_SIGNATURE)) {
      return { ok: false as const, message: "File PNG tidak valid" };
    }

    return { ok: true as const, contentType: "image/png" };
  }

  if (extension === ".pdf") {
    if (!hasSignature(buffer, PDF_SIGNATURE)) {
      return { ok: false as const, message: "File PDF tidak valid" };
    }

    return { ok: true as const, contentType: "application/pdf" };
  }

  if (extension === ".webp") {
    if (buffer.length < 12 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
      return { ok: false as const, message: "File WebP tidak valid" };
    }
    return { ok: true as const, contentType: "image/webp" };
  }

  if ([".xlsx", ".docx", ".pptx"].includes(extension)) {
    if (!hasSignature(buffer, ZIP_SIGNATURE)) {
      return {
        ok: false as const,
        message: "File Office modern tidak valid",
      };
    }

    const officeContentTypeMap: Record<string, string> = {
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".pptx":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };

    return {
      ok: true as const,
      contentType: officeContentTypeMap[extension] || mimeType || "application/zip",
    };
  }

  if ([".xls", ".doc", ".ppt"].includes(extension)) {
    if (!hasSignature(buffer, OLE_SIGNATURE)) {
      return {
        ok: false as const,
        message: "File Office legacy tidak valid",
      };
    }

    return {
      ok: true as const,
      contentType: mimeType || "application/octet-stream",
    };
  }

  if (extension === ".csv") {
    const textSample = buffer.subarray(0, Math.min(buffer.length, 512)).toString("utf8");
    if (textSample.includes("\u0000")) {
      return { ok: false as const, message: "File CSV tidak valid" };
    }

    return {
      ok: true as const,
      contentType: "text/csv",
    };
  }

  return {
    ok: false as const,
    message: "Format file tidak didukung",
  };
}
