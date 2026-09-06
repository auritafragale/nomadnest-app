/**
 * Photo messages in 1:1 chat.
 *
 * Photos are sent as a normal message whose body carries a compact
 * machine-readable marker, the same proven pattern used for check-in
 * cards (`[[checkin]]...`). No schema change needed.
 *
 * Format: `[[image]]{"url":"https://...","caption":"optional"}`
 */
const IMAGE_MARKER = "[[image]]";

export interface ChatImagePayload {
  url: string;
  caption: string | null;
}

export const buildImageMessageBody = (url: string, caption?: string): string =>
  `${IMAGE_MARKER}${JSON.stringify({ url, caption: caption?.trim() || null })}`;

export const parseImageMessage = (body: string): ChatImagePayload | null => {
  if (!body || !body.startsWith(IMAGE_MARKER)) return null;
  try {
    const json = JSON.parse(body.slice(IMAGE_MARKER.length));
    if (json && typeof json.url === "string") {
      return { url: json.url, caption: typeof json.caption === "string" ? json.caption : null };
    }
  } catch {
    // Not a valid image message.
  }
  return null;
};

/**
 * Human-friendly preview for structured message bodies, used in the
 * conversation list and in notification text so markers never leak raw.
 */
export const messagePreviewText = (body: string): string => {
  if (!body) return "";
  if (body.startsWith(IMAGE_MARKER)) {
    const img = parseImageMessage(body);
    return img?.caption ? `📷 ${img.caption}` : "📷 Photo";
  }
  if (body.startsWith("[[checkin]]")) return "🐾 Care check-in";
  return body;
};
