/**
 * Photo messages in 1:1 chat.
 *
 * Photos are sent as a normal message whose body carries a compact
 * machine-readable marker, the same pattern used for check-in cards.
 *
 * Format: `[[image]]{"path":"{conversation_id}/{uuid}.jpg","caption":"optional"}`
 * The path is in the PRIVATE chat-photos bucket (only the two members of the
 * conversation and admins can read it), shown through short-lived signed URLs.
 * Older test messages used a public "url"; those are removed by the cleanup.
 */
const IMAGE_MARKER = "[[image]]";

export const CHAT_PHOTO_BUCKET = "chat-photos";

export interface ChatImagePayload {
  /** Private storage path (current format). */
  path: string | null;
  /** Legacy public URL (old messages only). */
  url: string | null;
  caption: string | null;
}

export const buildImageMessageBody = (path: string, caption?: string): string =>
  `${IMAGE_MARKER}${JSON.stringify({ path, caption: caption?.trim() || null })}`;

export const parseImageMessage = (body: string): ChatImagePayload | null => {
  if (!body || !body.startsWith(IMAGE_MARKER)) return null;
  try {
    const json = JSON.parse(body.slice(IMAGE_MARKER.length));
    const path = typeof json?.path === "string" ? json.path : null;
    const url = typeof json?.url === "string" ? json.url : null;
    if (path || url) {
      return { path, url, caption: typeof json.caption === "string" ? json.caption : null };
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
  if (body.startsWith("[[phone_share]]")) return body.includes("\"shared\"") ? "📞 Shared a phone number" : "📞 Stopped sharing a phone number";
  if (body.startsWith("[[checkin]]")) return body.includes("\"daily_update\"") ? "🐾 Daily update" : "🐾 Care check-in";
  return body;
};
