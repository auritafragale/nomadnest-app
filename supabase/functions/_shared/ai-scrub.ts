// Text hygiene for the AI features (nomad-match, draft-invitation): the same
// rules as draft-application. Member-written text is scrubbed of contact
// details and tag characters before it reaches the model, and the model's
// output is scrubbed again as a backstop.

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi;
const BARE_DOMAIN_RE =
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|uk|app|dev|info|biz|global)(?:\/[^\s<>"')]*)?\b/gi;
const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}/;
const PHONE_CANDIDATE_RE = /(?:\+|\b00)?\d[\d\s().-]{5,}\d/g;
const SOCIAL_HANDLE_RE = /(^|\s)@[A-Za-z0-9_.]{2,30}\b/g;

const looksLikePhone = (candidate: string) => {
  if (ISO_DATE_RE.test(candidate)) return false;
  const digits = candidate.replace(/\D/g, "").length;
  return /^(\+|00)/.test(candidate) ? digits >= 8 : digits >= 9;
};

export const scrubContactDetails = (text: string, replacement: string) =>
  text
    .replace(EMAIL_RE, replacement)
    .replace(URL_RE, replacement)
    .replace(BARE_DOMAIN_RE, replacement)
    .replace(SOCIAL_HANDLE_RE, (_m, lead) => `${lead}${replacement}`)
    .replace(PHONE_CANDIDATE_RE, (m) => (looksLikePhone(m) ? replacement : m));

/** Member-written text → safe to place inside an XML-style data tag. */
export const clean = (value: unknown, maxLength = 600): string => {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value);
  return scrubContactDetails(text, "(contact detail removed)")
    .replace(/</g, "‹")
    .replace(/>/g, "›")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
};

/** Em/en dashes → commas; numeric ranges ("26–27") → "26 to 27". */
export const replaceDashes = (text: string) =>
  text
    .replace(/(\d)[ \t]*[–—][ \t]*(\d)/g, "$1 to $2")
    .replace(/^[ \t]*[–—]+[ \t]*/gm, "")
    .replace(/[ \t]*[–—]+[ \t]*/g, ", ")
    .replace(/,[ \t]*([,.!?;:])/g, "$1")
    .replace(/,[ \t]+$/gm, ",");

/** Model output → contact details removed outright (no placeholders). */
export const cleanOutput = (text: string) =>
  replaceDashes(scrubContactDetails(text, ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .trim();

export const tag = (name: string, content: string) => (content ? `<${name}>${content}</${name}>` : "");

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Whole days two date ranges share (inclusive), or 0. Dates are YYYY-MM-DD. */
export const overlapDays = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
  const s = aStart > bStart ? aStart : bStart;
  const e = aEnd < bEnd ? aEnd : bEnd;
  if (s > e) return 0;
  return Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / 86_400_000) + 1;
};
