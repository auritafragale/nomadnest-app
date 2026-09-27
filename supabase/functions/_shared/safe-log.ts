// Safe logging for edge functions.
//
// Logs may contain: user/record ids, masked emails, counts, status numbers,
// error codes. Never: full emails, names, phone numbers, message or note
// text, addresses, tokens, or request/response/error bodies from Stripe,
// Twilio, Resend, Onfido or Anthropic.
//
// Rerunnable check for risky log lines: node scripts/check-edge-logs.mjs

const EMAIL_RE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]+)?/g;
const BEARER_RE = /(bearer|token|key|secret|password)(["'\s:=]+)[A-Za-z0-9._~+/=-]{8,}/gi;
const MAX = 300;

/** a***@gmail.com */
export const maskEmail = (email: string | null | undefined): string => {
  if (!email) return "-";
  const [local, domain] = String(email).split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
};

/** Any value as a short string with emails masked and phones/tokens removed. */
export const redact = (value: unknown): string => {
  let text: string;
  if (value instanceof Error) {
    text = `${value.name}: ${value.message}`;
  } else if (typeof value === "string") {
    text = value;
  } else if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    // Supabase / PostgREST / Stripe style errors: keep the useful fields.
    const picked = ["name", "code", "status", "statusCode", "type", "message"]
      .filter((k) => v[k] !== undefined && v[k] !== null)
      .map((k) => `${k}=${String(v[k])}`);
    text = picked.length ? picked.join(" ") : "[object]";
  } else {
    text = String(value);
  }
  return text
    .replace(EMAIL_RE, (_m, first, domain) => `${first}***@${domain}`)
    .replace(JWT_RE, "[token]")
    .replace(BEARER_RE, "$1$2[redacted]")
    .replace(PHONE_RE, "[phone]")
    .slice(0, MAX);
};

/**
 * A provider's error response body (Stripe, Twilio, Resend, Onfido,
 * Anthropic) reduced to its error type/code only. Never logs the body.
 */
export const providerError = (status: number, bodyText: string | null | undefined): string => {
  let code = "";
  try {
    const parsed = JSON.parse(bodyText ?? "");
    const e = parsed?.error ?? parsed;
    code = [e?.type, e?.code, e?.error_code, parsed?.code, parsed?.name]
      .filter((x) => typeof x === "string" || typeof x === "number")
      .map(String)
      .slice(0, 2)
      .join("/");
  } catch {
    // Not JSON: log nothing from it.
  }
  return `status=${status}${code ? ` code=${redact(code).slice(0, 80)}` : ""}`;
};
