/**
 * Shrinks a photo in the browser before upload: longest side at most
 * `maxDimension`, re-encoded as JPEG. Keeps uploads fast on mobile data and
 * well under the 5 MB storage and AI image limits.
 */
export const resizeImage = async (
  file: File,
  maxDimension = 1600,
  quality = 0.85,
): Promise<Blob> => {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file couldn't be read as an image."));
      el.src = url;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser couldn't process this photo.");
    ctx.drawImage(img, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Your browser couldn't process this photo."))),
        "image/jpeg",
        quality,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * A photo ready to upload with no location or other metadata: JPEG, PNG,
 * WebP and HEIC photos are redrawn and re-encoded on the device as JPEG
 * (longest side at most `maxDimension`). Other files (PDFs, GIFs) are
 * returned unchanged.
 */
export const photoWithoutMetadata = async (
  file: File,
  maxDimension = 2000,
): Promise<{ body: Blob; ext: string; contentType: string }> => {
  if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.type)) {
    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1) : "bin";
    return { body: file, ext, contentType: file.type || "application/octet-stream" };
  }
  const body = await resizeImage(file, maxDimension, 0.88);
  return { body, ext: "jpg", contentType: "image/jpeg" };
};
