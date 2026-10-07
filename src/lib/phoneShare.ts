/**
 * Share my number: the chat only carries a marker (never the number).
 * Format: `[[phone_share]]{"action":"shared"|"stopped"|"ended"}`, written by
 * the database (share_my_phone, stop_sharing_my_phone, or a cancelled sit).
 * The card reads the number through get_phone_shares, which returns it only
 * to the person it's shared with, and only while it's shared.
 */
export const PHONE_SHARE_MARKER = "[[phone_share]]";

export type PhoneShareAction = "shared" | "stopped" | "ended";

export const parsePhoneShareMessage = (body: string): PhoneShareAction | null => {
  if (!body || !body.startsWith(PHONE_SHARE_MARKER)) return null;
  try {
    const action = JSON.parse(body.slice(PHONE_SHARE_MARKER.length))?.action;
    return action === "shared" || action === "stopped" || action === "ended" ? action : null;
  } catch {
    return null;
  }
};

/** Digits and a leading + only, for tel: and wa.me links. */
export const telHref = (number: string) => `tel:${number.replace(/[^\d+]/g, "")}`;
export const whatsAppHref = (number: string) => `https://wa.me/${number.replace(/\D/g, "")}`;
