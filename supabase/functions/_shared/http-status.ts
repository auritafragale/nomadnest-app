// Status codes and reasons for edge function errors. Pure TypeScript (no
// Deno APIs), so the front-end tests can import it.
//
// 401 means only "not signed in": no token, or a token the auth server
// rejects (invalid, expired, session ended). The app treats a 401 as a
// possible ended sign-in, so a signed-in member who isn't allowed gets 403,
// and bad input gets 400. Every error body carries a reason.

export const REASON_STATUS = {
  auth_missing_token: 401,
  auth_get_user_failed: 401,
  auth_unavailable: 503,
  not_allowed: 403,
  admin_only: 403,
  internal_only: 403,
  feature_off: 403,
  membership_needed: 403,
  captcha_failed: 403,
  bad_input: 400,
  no_email: 400,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  rate_limited: 429,
  provider_failed: 502,
} as const;

export type Reason = keyof typeof REASON_STATUS;

export const statusFor = (reason: Reason): number => REASON_STATUS[reason];

/** The JSON body for an error: always { error, reason }, plus any extras. */
export const errorBody = (reason: Reason, error: string, extra: Record<string, unknown> = {}) => ({ ...extra, error, reason });

/**
 * Why auth.getUser(jwt) failed. The auth server rejecting the token (4xx)
 * means the sign-in is over; a network failure or auth outage (status 0 or
 * 5xx) doesn't, so it must not be answered with 401.
 */
export const getUserFailureReason = (error: { status?: number } | null | undefined): Reason => {
  const status = error?.status;
  if (error && (status === undefined || status === 0 || status >= 500)) return "auth_unavailable";
  return "auth_get_user_failed";
};
