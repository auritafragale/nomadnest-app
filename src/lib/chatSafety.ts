/**
 * Gentle reminders in chat. Runs in the browser only: nothing here is logged,
 * stored or sent anywhere. The contact patterns are the same as
 * supabase/functions/_shared/ai-scrub.ts.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/i;
const BARE_DOMAIN_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|uk|app|dev|info|biz|global)(?:\/[^\s<>"')]*)?\b/i;
const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}/;
const PHONE_CANDIDATE_RE = /(?:\+|\b00)?\d[\d\s().-]{5,}\d/g;
const SOCIAL_HANDLE_RE = /(^|\s)@[A-Za-z0-9_.]{2,30}\b/;

const looksLikePhone = (candidate: string) => {
  if (ISO_DATE_RE.test(candidate)) return false;
  const digits = candidate.replace(/\D/g, "").length;
  return /^(\+|00)/.test(candidate) ? digits >= 8 : digits >= 9;
};

export type ContactKind = "phone" | "email" | "link" | "handle";

/** The first kind of contact detail the text seems to contain, if any. */
export const detectContactDetail = (text: string): ContactKind | null => {
  if (!text) return null;
  if (EMAIL_RE.test(text)) return "email";
  if (URL_RE.test(text) || BARE_DOMAIN_RE.test(text)) return "link";
  if ((text.match(PHONE_CANDIDATE_RE) ?? []).some(looksLikePhone)) return "phone";
  if (SOCIAL_HANDLE_RE.test(text)) return "handle";
  return null;
};

export const CONTACT_LABEL: Record<ContactKind, string> = {
  phone: "a phone number",
  email: "an email",
  link: "a link",
  handle: "a social media handle",
};

const MONEY_RE =
  /\b(pay|pays|paid|paying|payment|payments|deposit|deposits|fee|fees|cash|bank transfer|wire transfer|paypal|revolut|wise|western union)\b|[£€$]\s?\d|\d\s?[£€$]/i;

/** Does the text talk about money? (Sits never involve money.) */
export const mentionsMoney = (text: string): boolean => !!text && MONEY_RE.test(text);

export const MONEY_NOTE =
  "Sits on NomadNest never involve money. Pet Parents don't pay Nomads and Nomads never pay to sit. If someone asks you for money, please report it.";

export const NOT_CONFIRMED_NOTE =
  "Not confirmed yet. Keep phone numbers and emails in NomadNest until a sit is confirmed. Sits never involve money: no one should pay or ask for payment.";
