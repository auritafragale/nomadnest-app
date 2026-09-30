/**
 * When a photo was taken, from its EXIF DateTimeOriginal (JPEG only), read on
 * the device before the photo is re-encoded without its metadata. Only the
 * date and time are read; location and every other tag are ignored and never
 * leave the device. Falls back to the file's last-modified time, else null.
 *
 * EXIF dates have no time zone, so they're read as the device's local time.
 */
export const readPhotoTakenAt = async (file: File): Promise<string | null> => {
  try {
    const exif = await readExifDate(file);
    if (exif) return exif.toISOString();
  } catch {
    // Unreadable metadata: fall back below.
  }
  return file.lastModified ? new Date(file.lastModified).toISOString() : null;
};

const readExifDate = async (file: File): Promise<Date | null> => {
  // The EXIF block sits near the start of a JPEG; 256 KB is plenty.
  const buf = await file.slice(0, 256 * 1024).arrayBuffer();
  const view = new DataView(buf);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
      return parseTiffDate(view, offset + 10);
    }
    if ((marker & 0xff00) !== 0xff00 || size < 2) return null;
    offset += 2 + size;
  }
  return null;
};

const parseTiffDate = (view: DataView, tiff: number): Date | null => {
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const readAscii = (o: number, n: number) => {
    let s = "";
    for (let i = 0; i < n && o + i < view.byteLength; i++) {
      const c = view.getUint8(o + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const findTag = (ifd: number, tag: number) => {
    if (ifd + 2 > view.byteLength) return null;
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > view.byteLength) return null;
      if (u16(entry) === tag) return entry;
    }
    return null;
  };
  const ifd0 = tiff + u32(tiff + 4);
  const exifPointer = findTag(ifd0, 0x8769);
  const dateEntry =
    (exifPointer !== null && findTag(tiff + u32(exifPointer + 8), 0x9003)) || // DateTimeOriginal
    findTag(ifd0, 0x0132); // DateTime
  if (!dateEntry) return null;
  const text = readAscii(tiff + u32(dateEntry + 8), 19); // "YYYY:MM:DD HH:MM:SS"
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(d.getTime()) ? null : d;
};
