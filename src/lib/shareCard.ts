/**
 * Sit Story share card, drawn on the device (no upload, no public link):
 * 1080x1350 (feed) or 1080x1920 (story), with the title, 1 to 4 photos the
 * owner picked, a short excerpt and subtle NomadNest branding.
 */

export type ShareCardSize = "feed" | "story";

const W = 1080;
const HEIGHT: Record<ShareCardSize, number> = { feed: 1350, story: 1920 };
const PHOTO_AREA: Record<ShareCardSize, number> = { feed: 760, story: 1180 };
const PAD = 64;
const GAP = 12;
const COLORS = { bg: "#FAF7F2", ink: "#1F2A2E", muted: "#5F6B6E", accent: "#E8735A" };

/** First one or two sentences, up to about 160 characters. */
export const defaultExcerpt = (story: string, max = 160) => {
  const sentences = story.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+(\s|$)/g) ?? [story];
  let out = sentences[0].trim();
  if (sentences[1] && (out + " " + sentences[1].trim()).length <= max) out = `${out} ${sentences[1].trim()}`;
  if (out.length > max) out = `${out.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
  return out;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("A photo couldn't be loaded."));
    img.src = src;
  });

const roundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/** Draws the image to cover the box (cropped, centred) with rounded corners. */
const drawCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.save();
  roundedRect(ctx, x, y, w, h, 28);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
};

/** Photo boxes for 1 to 4 photos inside the photo area. */
const layout = (n: number, x: number, y: number, w: number, h: number) => {
  const half = (w - GAP) / 2;
  const halfH = (h - GAP) / 2;
  if (n <= 1) return [[x, y, w, h]];
  if (n === 2) return [[x, y, half, h], [x + half + GAP, y, half, h]];
  if (n === 3) return [[x, y, w, halfH], [x, y + halfH + GAP, half, halfH], [x + half + GAP, y + halfH + GAP, half, halfH]];
  return [[x, y, half, halfH], [x + half + GAP, y, half, halfH], [x, y + halfH + GAP, half, halfH], [x + half + GAP, y + halfH + GAP, half, halfH]];
};

/** Wraps text into lines that fit; the last line gets "…" if it overflows. */
const wrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && lines.join(" ").length < text.length) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
};

export const renderShareCard = async (opts: {
  size: ShareCardSize;
  title: string;
  excerpt: string;
  photoUrls: string[];
  city: string | null;
  /** The sitter's first name, or null to say "our NomadNest sitter". */
  sitterName: string | null;
}): Promise<Blob> => {
  const H = HEIGHT[opts.size];
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't create the image.");
  if (document.fonts?.ready) await document.fonts.ready;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Photos
  const photos = await Promise.all(opts.photoUrls.slice(0, 4).map(loadImage));
  const boxes = layout(photos.length, PAD, PAD, W - PAD * 2, PHOTO_AREA[opts.size]);
  photos.forEach((img, i) => {
    const [x, y, w, h] = boxes[i];
    drawCover(ctx, img, x, y, w, h);
  });

  // Text
  let y = PAD + PHOTO_AREA[opts.size] + 72;
  ctx.fillStyle = COLORS.accent;
  ctx.font = "600 30px system-ui, -apple-system, 'Segoe UI', sans-serif";
  const kicker = ["A NomadNest Sit Story", opts.city].filter(Boolean).join(" · ");
  ctx.fillText(kicker.toUpperCase(), PAD, y);

  y += 70;
  ctx.fillStyle = COLORS.ink;
  ctx.font = "700 68px Georgia, 'Times New Roman', serif";
  for (const line of wrap(ctx, opts.title, W - PAD * 2, 2)) {
    ctx.fillText(line, PAD, y);
    y += 80;
  }

  y += 10;
  ctx.fillStyle = COLORS.muted;
  ctx.font = "400 38px system-ui, -apple-system, 'Segoe UI', sans-serif";
  const excerptLines = opts.size === "story" ? 5 : 3;
  for (const line of wrap(ctx, `“${opts.excerpt}”`, W - PAD * 2, excerptLines)) {
    ctx.fillText(line, PAD, y);
    y += 52;
  }

  y += 16;
  ctx.fillStyle = COLORS.ink;
  ctx.font = "500 34px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText(opts.sitterName ? `Cared for by ${opts.sitterName}` : "Cared for by our NomadNest sitter", PAD, y);

  // Branding, bottom right: icon + wordmark, subtle.
  try {
    const icon = await loadImage("/icon-192.png");
    ctx.globalAlpha = 0.9;
    ctx.drawImage(icon, W - PAD - 260, H - PAD - 56, 56, 56);
    ctx.globalAlpha = 1;
  } catch {
    // Wordmark only.
  }
  ctx.fillStyle = COLORS.ink;
  ctx.font = "700 36px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText("NomadNest", W - PAD - 190, H - PAD - 16);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image couldn't be created."))), "image/jpeg", 0.92),
  );
};

/** Opens the phone's share sheet with the image, or downloads it. */
export const shareOrDownload = async (blob: Blob, fileName: string, title: string) => {
  const file = new File([blob], fileName, { type: "image/jpeg" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title });
      return "shared" as const;
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return "cancelled" as const;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded" as const;
};
