// Removes location and other metadata from a photo at byte level, without
// re-encoding, so the picture itself is unchanged.
//
// JPEG: APP1 (EXIF and XMP), APP13 (IPTC) and COM segments are removed.
//   APP2 (colour profile) and everything else stays.
// PNG: eXIf, tEXt, iTXt and zTXt chunks are dropped.
// WebP: EXIF and XMP chunks are dropped (and their VP8X flags cleared).
// In all three, if the EXIF said the photo is rotated (Orientation 2–8), a
// tiny EXIF block with only that Orientation is put back, because browsers
// apply it: without it the photo would show sideways.
// Anything else: kind "other", returned unchanged.

export type PhotoKind = "jpeg" | "png" | "webp" | "other";

export interface StripResult {
  kind: PhotoKind;
  /** Something was removed; `bytes` is the cleaned file. */
  changed: boolean;
  /** GPS data was found (EXIF GPS tag, or GPS in XMP or text chunks). */
  hadGps: boolean;
  /** Any metadata was found (including GPS). */
  hadMetadata: boolean;
  bytes: Uint8Array;
}

const ascii = (b: Uint8Array, start: number, length: number) => {
  let s = "";
  for (let i = start; i < start + length && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};
const textOf = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
const mentionsGps = (text: string) => /GPS(Latitude|Longitude|Position|Coordinates)|exif:GPS|Iptc4xmpExt:LocationShown/i.test(text);

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

interface TiffInfo {
  hasGps: boolean;
  orientation: number | null;
  /** Only an Orientation tag and nothing else (already minimal). */
  onlyOrientation: boolean;
}

/** Reads a TIFF block (as found in EXIF): GPS pointer and Orientation. */
const readTiff = (b: Uint8Array, start: number, end: number): TiffInfo => {
  const none = { hasGps: false, orientation: null, onlyOrientation: false };
  if (end - start < 8) return none;
  const view = new DataView(b.buffer, b.byteOffset + start, end - start);
  const order = ascii(b, start, 2);
  if (order !== "II" && order !== "MM") return none;
  const little = order === "II";
  const ifd0 = view.getUint32(4, little);
  if (ifd0 + 2 > view.byteLength) return none;
  const count = view.getUint16(ifd0, little);
  let hasGps = false;
  let orientation: number | null = null;
  for (let i = 0; i < count; i++) {
    const e = ifd0 + 2 + i * 12;
    if (e + 12 > view.byteLength) break;
    const tag = view.getUint16(e, little);
    if (tag === 0x8825) hasGps = true;
    if (tag === 0x0112) orientation = view.getUint16(e + 8, little);
  }
  const next = ifd0 + 2 + count * 12 + 4 <= view.byteLength ? view.getUint32(ifd0 + 2 + count * 12, little) : 0;
  return { hasGps, orientation, onlyOrientation: count === 1 && orientation !== null && next === 0 };
};

/** A TIFF block holding only an Orientation tag. */
const orientationTiff = (orientation: number) => [
  0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF, IFD0 at 8
  0x00, 0x01, // one entry
  0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, (orientation >> 8) & 0xff, orientation & 0xff, 0x00, 0x00, // Orientation, SHORT, 1
  0x00, 0x00, 0x00, 0x00, // no next IFD
];

/** An APP1 segment holding only an EXIF Orientation tag. */
const orientationApp1 = (orientation: number) => {
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...orientationTiff(orientation)]; // "Exif\0\0" + TIFF
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...payload]);
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: number[]) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

/** A PNG eXIf chunk holding only an Orientation tag. */
const orientationPngChunk = (orientation: number) => {
  const data = orientationTiff(orientation);
  const typeAndData = [0x65, 0x58, 0x49, 0x66, ...data]; // "eXIf"
  return new Uint8Array([...be32(data.length), ...typeAndData, ...be32(crc32(typeAndData))]);
};

/** A WebP EXIF chunk holding only an Orientation tag. */
const orientationWebpChunk = (orientation: number) => {
  const data = orientationTiff(orientation);
  return new Uint8Array([0x45, 0x58, 0x49, 0x46, data.length & 0xff, (data.length >> 8) & 0xff, 0, 0, ...data]); // "EXIF", even size
};

const stripJpeg = (b: Uint8Array): StripResult => {
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  let changed = false;
  let hadGps = false;
  let hadMetadata = false;
  let orientation: number | null = null;
  let keptOrientation = false;
  while (i < b.length) {
    if (b[i] !== 0xff) return { kind: "jpeg", changed: false, hadGps, hadMetadata, bytes: b }; // unexpected layout: leave it
    let m = i + 1;
    while (m < b.length && b[m] === 0xff) m++; // fill bytes
    const marker = b[m];
    if (marker === 0xda || marker === 0xd9) {
      parts.push(b.subarray(i)); // image data (and end) unchanged
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(b.subarray(i, m + 1));
      i = m + 1;
      continue;
    }
    if (m + 2 >= b.length) return { kind: "jpeg", changed: false, hadGps, hadMetadata, bytes: b };
    const len = (b[m + 1] << 8) | b[m + 2];
    const end = m + 1 + len;
    if (len < 2 || end > b.length) return { kind: "jpeg", changed: false, hadGps, hadMetadata, bytes: b };
    const dataStart = m + 3;
    if (marker === 0xe1) {
      hadMetadata = true;
      if (ascii(b, dataStart, 6) === "Exif\0\0") {
        const info = readTiff(b, dataStart + 6, end);
        if (info.hasGps) hadGps = true;
        if (info.onlyOrientation && !keptOrientation) {
          // Already just an Orientation tag: keep as is.
          keptOrientation = true;
          parts.push(b.subarray(i, end));
          i = end;
          continue;
        }
        if (info.orientation && info.orientation >= 2 && info.orientation <= 8) orientation = info.orientation;
      } else if (mentionsGps(textOf(b.subarray(dataStart, end)))) {
        hadGps = true;
      }
      changed = true;
      i = end;
      continue;
    }
    if (marker === 0xed || marker === 0xfe) {
      hadMetadata = true;
      if (mentionsGps(textOf(b.subarray(dataStart, end)))) hadGps = true;
      changed = true;
      i = end;
      continue;
    }
    parts.push(b.subarray(i, end));
    i = end;
  }
  if (keptOrientation && !changed) hadMetadata = false; // only the minimal Orientation block: nothing to clean
  if (orientation && !keptOrientation) parts.splice(1, 0, orientationApp1(orientation));
  return { kind: "jpeg", changed, hadGps, hadMetadata, bytes: changed ? concat(parts) : b };
};

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROP = new Set(["eXIf", "tEXt", "iTXt", "zTXt"]);

const stripPng = (b: Uint8Array): StripResult => {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  let changed = false;
  let hadGps = false;
  let hadMetadata = false;
  while (i + 12 <= b.length) {
    const len = view.getUint32(i);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length) return { kind: "png", changed: false, hadGps, hadMetadata, bytes: b };
    if (type === "eXIf") {
      const info = readTiff(b, i + 8, i + 8 + len);
      if (info.onlyOrientation) {
        parts.push(b.subarray(i, end)); // already minimal
      } else {
        hadMetadata = true;
        if (info.hasGps) hadGps = true;
        if (info.orientation && info.orientation >= 2 && info.orientation <= 8) {
          parts.push(orientationPngChunk(info.orientation)); // same place in the file
        }
        changed = true;
      }
    } else if (PNG_DROP.has(type)) {
      hadMetadata = true;
      if (mentionsGps(textOf(b.subarray(i + 8, i + 8 + len)))) hadGps = true;
      changed = true;
    } else {
      parts.push(b.subarray(i, end));
    }
    i = end;
    if (type === "IEND") break;
  }
  return { kind: "png", changed, hadGps, hadMetadata, bytes: changed ? concat(parts) : b };
};

const stripWebp = (b: Uint8Array): StripResult => {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const parts: Uint8Array[] = [];
  let i = 12;
  let changed = false;
  let hadGps = false;
  let hadMetadata = false;
  let vp8xIndex = -1;
  let keepExif = false;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const size = view.getUint32(i + 4, true);
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > b.length) return { kind: "webp", changed: false, hadGps, hadMetadata, bytes: b };
    if (type === "EXIF") {
      const dataStart = i + 8;
      const tiffStart = ascii(b, dataStart, 6) === "Exif\0\0" ? dataStart + 6 : dataStart;
      const info = readTiff(b, tiffStart, dataStart + size);
      if (info.onlyOrientation) {
        keepExif = true;
        parts.push(b.subarray(i, Math.min(end, b.length))); // already minimal
      } else {
        hadMetadata = true;
        if (info.hasGps) hadGps = true;
        if (info.orientation && info.orientation >= 2 && info.orientation <= 8) {
          keepExif = true;
          parts.push(orientationWebpChunk(info.orientation));
        }
        changed = true;
      }
    } else if (type === "XMP ") {
      hadMetadata = true;
      if (mentionsGps(textOf(b.subarray(i + 8, i + 8 + size)))) hadGps = true;
      changed = true;
    } else {
      if (type === "VP8X") vp8xIndex = parts.length;
      parts.push(b.subarray(i, Math.min(end, b.length)));
    }
    i = end;
  }
  if (!changed) return { kind: "webp", changed, hadGps, hadMetadata, bytes: b };
  if (vp8xIndex >= 0) {
    const vp8x = parts[vp8xIndex].slice();
    vp8x[8] &= ~(0x04 | (keepExif ? 0 : 0x08)); // XMP flag, and EXIF unless an Orientation-only EXIF stays
    parts[vp8xIndex] = vp8x;
  }
  const body = concat(parts);
  const out = new Uint8Array(12 + body.length);
  out.set(b.subarray(0, 12), 0);
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(body, 12);
  return { kind: "webp", changed, hadGps, hadMetadata, bytes: out };
};

export const stripPhotoMetadata = (bytes: Uint8Array): StripResult => {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return stripJpeg(bytes);
  if (bytes.length > 8 && PNG_SIG.every((v, k) => bytes[k] === v)) return stripPng(bytes);
  if (bytes.length > 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return stripWebp(bytes);
  return { kind: "other", changed: false, hadGps: false, hadMetadata: false, bytes };
};
