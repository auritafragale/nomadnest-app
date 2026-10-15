/**
 * Before telling a member their sign-in has ended, check it really has:
 * a 401 can come from a function that refused for another reason.
 */
export interface SessionProbe {
  /** Does the auth server still accept the session? */
  getUser: () => Promise<boolean>;
  /** Can the session be refreshed? */
  refresh: () => Promise<boolean>;
}

export const sessionHasEnded = async (probe: SessionProbe): Promise<boolean> => {
  if (await probe.getUser().catch(() => false)) return false;
  if (await probe.refresh().catch(() => false)) return false;
  return true;
};

/** Is this response worth checking? A 401 from our functions or database,
 *  other than "no token was sent", while a session is stored. */
export const isSignInEndedCandidate = (opts: {
  status: number;
  url: string;
  supabaseUrl: string;
  body: unknown;
  hasStoredSession: boolean;
}) => {
  const { status, url, supabaseUrl, body, hasStoredSession } = opts;
  if (status !== 401 || !hasStoredSession || !url.startsWith(supabaseUrl) || url.includes("/auth/v1/")) return false;
  const reason = (body as { reason?: unknown } | null)?.reason;
  if (url.includes("/functions/v1/")) return reason !== "auth_missing_token";
  return /auth_get_user_failed|PGRST30[0-9]|JWT|jwt|session/i.test(JSON.stringify(body ?? {}));
};

/** An auth error that really means "no longer signed in". A network failure
 *  or an auth-server outage (status 0 or 5xx) does not: we can't tell yet. */
export const authErrorMeansEnded = (error: { status?: number } | null | undefined) => {
  if (!error) return false;
  const status = error.status ?? 0;
  return status > 0 && status < 500;
};

/** A members-only call refused because the session is missing, expired or
 *  being refreshed (or the caller isn't allowed). Screens treat it quietly:
 *  no error screen, no toast; the query runs again once signed in. */
export const isQuietAuthError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;
  const message = typeof e.message === "string" ? e.message : "";
  return (
    status === 401 ||
    status === 403 ||
    ["PGRST301", "PGRST302", "42501", "28000"].includes(code) ||
    /jwt|permission denied|not signed in|sign in again|not authenticated/i.test(message)
  );
};
