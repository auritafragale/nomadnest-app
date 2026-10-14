/**
 * "Your sign-in has ended". When the member's session stops working (signed
 * out on another device, refresh failed), any call to an edge function or the
 * database answers 401. A 401 is only a hint: before saying anything we ask
 * the auth server whether the session still works, and try a refresh. Only
 * when both fail do we show one friendly message and send them to /auth with
 * a link back to where they were.
 */
import { isSignInEndedCandidate, sessionHasEnded, type SessionProbe } from "./signInCheck";

export const SIGN_IN_ENDED_EVENT = "nn:sign-in-ended";
export const SIGN_IN_ENDED_MESSAGE = "Your sign-in has ended. Please sign in again.";

let intentional = false;
let fired = false;

/** Our own Log out: not an "ended" sign-in. */
export const markIntentionalSignOut = () => {
  intentional = true;
  setTimeout(() => {
    intentional = false;
  }, 5000);
};

/** After a fresh sign-in the message can show again later. */
export const resetSignInEnded = () => {
  fired = false;
};

export const signInEnded = () => {
  if (intentional || fired) return;
  fired = true;
  window.dispatchEvent(new CustomEvent(SIGN_IN_ENDED_EVENT));
};

const hasStoredSession = () => {
  try {
    return Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k) && !!localStorage.getItem(k));
  } catch {
    return false;
  }
};

const CHECK_DELAY_MS = 2000;
let timer: ReturnType<typeof setTimeout> | null = null;
let checking = false;

/** Check the session once (2s after the first 401, one check at a time). */
const scheduleCheck = (probe: SessionProbe, path: string) => {
  if (timer || checking) return;
  timer = setTimeout(async () => {
    timer = null;
    checking = true;
    try {
      if (await sessionHasEnded(probe)) signInEnded();
      else if (import.meta.env.DEV) console.warn("[sign-in] a 401 was ignored: the session still works", path);
    } finally {
      checking = false;
    }
  }, CHECK_DELAY_MS);
};

/**
 * Watches Supabase responses for an ended sign-in: a 401 from an edge
 * function, or a JWT error from the database. Installed once at start-up.
 */
export const installSignInWatcher = (supabaseUrl: string, probe: SessionProbe) => {
  if (typeof window === "undefined" || !supabaseUrl) return;
  const w = window as Window & { __nnSignInWatcher?: boolean };
  if (w.__nnSignInWatcher) return;
  w.__nnSignInWatcher = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    try {
      if (res.status === 401) {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const body = await res.clone().json().catch(() => null);
        if (isSignInEndedCandidate({ status: res.status, url, supabaseUrl, body, hasStoredSession: hasStoredSession() })) {
          // The path only, never the query string or any token.
          scheduleCheck(probe, new URL(url).pathname);
        }
      }
    } catch {
      // Never let the watcher break a request.
    }
    return res;
  };
};
