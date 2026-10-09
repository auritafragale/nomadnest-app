/**
 * "Your sign-in has ended". When the member's session stops working (signed
 * out on another device, refresh failed), any call to an edge function or the
 * database answers 401. We catch that once, show one friendly message and
 * send them to /auth with a link back to where they were. No console spam,
 * no blank screen.
 */

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

/**
 * Watches Supabase responses for an ended sign-in: a 401 from an edge
 * function, or a JWT error from the database. Installed once at start-up.
 */
export const installSignInWatcher = (supabaseUrl: string) => {
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
        if (url.startsWith(supabaseUrl) && !url.includes("/auth/v1/") && hasStoredSession()) {
          const body = await res.clone().json().catch(() => null);
          const text = JSON.stringify(body ?? {});
          const isFunction = url.includes("/functions/v1/");
          if (
            (isFunction && body?.reason !== "auth_missing_token") ||
            /auth_get_user_failed|PGRST30[0-9]|JWT|jwt|session/i.test(text)
          ) {
            signInEnded();
          }
        }
      }
    } catch {
      // Never let the watcher break a request.
    }
    return res;
  };
};
