// Internal callers only: cron jobs (public.request_internal_function) and
// database triggers send x-internal-secret, read from Vault
// (internal_trigger_secret). The function compares it with its own
// INTERNAL_TRIGGER_SECRET in constant time.

const safeEqual = (a: string, b: string) => {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

/** null if the caller is internal; otherwise a 403 response to return. A wrong
 *  secret is "not allowed", never a member whose sign-in has ended. */
export const rejectIfNotInternal = (req: Request, fn: string): Response | null => {
  const expected = Deno.env.get("INTERNAL_TRIGGER_SECRET") ?? "";
  const provided = req.headers.get("x-internal-secret") ?? "";
  if (expected && safeEqual(provided, expected)) return null;
  console.log(JSON.stringify({ fn: fn, rejected: "internal_secret_mismatch" }));
  return new Response(JSON.stringify({ error: "Internal callers only.", reason: "internal_only" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
};
