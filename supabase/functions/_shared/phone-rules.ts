// Phone verification helpers. Pure TypeScript (Web Crypto only), so the
// front-end tests can import them.

/** The number in E.164 (+441234567890), or null if it can't be one.
 *  Members type spaces, dashes, brackets or the "00" prefix. */
export const toE164 = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  const plus = digits.startsWith("+") ? digits : digits.startsWith("00") ? `+${digits.slice(2)}` : `+${digits}`;
  const e164 = `+${plus.slice(1).replace(/\+/g, "")}`;
  return /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
};

/**
 * A keyed hash of the number (HMAC-SHA-256, hex), so the attempts table never
 * holds the number and a list of all numbers can't reverse it without the
 * key. The key is a server secret.
 */
export const phoneHash = async (e164: string, key: string): Promise<string> => {
  if (!key) throw new Error("no hash key");
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(`phone:${e164}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
};

/** The plain words members see. Never Twilio's own text. */
export const PHONE_MESSAGES = {
  tooMany: "Too many codes requested. Please try again later.",
  badNumber: "That number doesn't look right. Include your country code, e.g. +44 7534 640769.",
  // Neutral: never says another account has it.
  unavailable: "We can't use this number. Please try a different one.",
  sendFailed: "We couldn't send a code to that number. Please check it and try again.",
  wrongNumber: "Please request a code for this number first.",
  badCode: "That code didn't work. Please check it, or request a new one.",
  missing: "Please enter your number and the code.",
  notReady: "Phone verification isn't available right now. Please try again later.",
} as const;
