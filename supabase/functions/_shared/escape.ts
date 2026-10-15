// Escaping for text people wrote (names, listing titles, report reasons,
// contact form fields) before it goes into an email. Pure TypeScript (no Deno
// APIs), so the front-end tests can import it.

/** For anything placed inside HTML: element text or an attribute value. */
export const escapeHtml = (value: string) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Control characters (including newlines and tabs), and the Unicode line and
// paragraph separators, which could start a new mail header line.
const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g;

/** A plain-text subject line: no control characters or line breaks, spaces
 *  collapsed, at most `max` characters (whole characters, never half an emoji). */
export const plainSubject = (value: string, max = 120) => {
  const flat = String(value ?? "").replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  return chars.length <= max ? flat : chars.slice(0, max - 1).join("").trimEnd() + "…";
};
