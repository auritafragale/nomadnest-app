// Preparing ID photos on the phone before upload: smaller files, no EXIF
// (so no GPS location), and always an explicit content type.

export const MAX_LONG_SIDE = 2000;
export const JPEG_QUALITY = 0.85;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Scale (w, h) down so the long side is at most `max`. Never scales up. */
export const fitWithin = (w: number, h: number, max = MAX_LONG_SIDE) => {
  const long = Math.max(w, h);
  if (long <= max || long === 0) return { width: w, height: h };
  const k = max / long;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
};

const BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

export const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

/** The content type to upload with: the file's own if allowed, else from the extension. */
export const contentTypeFor = (name: string, type: string): string | null => {
  const t = (type || "").toLowerCase();
  if (Object.values(BY_EXT).includes(t)) return t;
  if (t === "image/jpg") return "image/jpeg";
  return BY_EXT[extensionOf(name)] ?? null;
};

export const extensionFor = (contentType: string) =>
  ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf" })[
    contentType
  ] ?? "jpg";

/** The file name extensions the ID bucket accepts (its upload rule, F1f). */
export const ALLOWED_ID_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf"] as const;

/** Where a picked file is saved: {uid}/draft/{id|selfie}-{timestamp}.{ext},
 *  the extension always lower case and from the content type sent. */
export const draftPath = (userId: string, kind: "id" | "selfie", contentType: string, now = Date.now()) =>
  `${userId}/draft/${kind}-${now}.${extensionFor(contentType)}`;

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

const decode = async (file: Blob): Promise<Decoded | null> => {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
};

/**
 * Ready a picked file for upload. Images the browser can read are re-encoded
 * as JPEG (long side at most 2000px, quality 0.85), which drops EXIF data.
 * Images it can't read (e.g. HEIC) and PDFs go as they are.
 * Returns null with a reason when the file can't be used.
 */
export const prepareIdFile = async (
  file: File,
  allowPdf: boolean,
): Promise<{ blob: Blob; contentType: string } | { error: string }> => {
  if (file.size === 0) return { error: "That photo came through empty. Please try again." };
  const type = contentTypeFor(file.name, file.type);
  const looksLikeImage = (file.type || "").toLowerCase().startsWith("image/") || !file.type;

  if (type === "application/pdf") {
    if (!allowPdf) return { error: "Please use a photo." };
    if (file.size > MAX_UPLOAD_BYTES) return { error: "That file is larger than 10MB. Please choose a smaller one." };
    return { blob: file, contentType: type };
  }
  if (!type && !looksLikeImage) return { error: allowPdf ? "Please choose a photo or a PDF." : "Please use a photo." };

  const decoded = await decode(file);
  if (decoded && decoded.width > 0 && decoded.height > 0) {
    try {
      const { width, height } = fitWithin(decoded.width, decoded.height);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(decoded.source, 0, 0, width, height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
        if (blob && blob.size > 0) return { blob, contentType: "image/jpeg" };
      }
    } finally {
      decoded.close();
    }
  }
  // Couldn't re-encode: send the original, typed from its extension.
  if (!type) return { error: "We couldn't read that photo. Please try another one." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "That file is larger than 10MB. Please choose a smaller one." };
  return { blob: file, contentType: type };
};
