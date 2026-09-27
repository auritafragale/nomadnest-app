-- ═══════════════════════════════════════════════════════════════════════════
-- Privacy hardening, batch 5: cron secrets, contact form rate limits
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. contact_rate_limits: keyed hashes (HMAC-SHA256) of the IP and email of
--    each contact form submission, for rate limiting. Service role only; the
--    edge function deletes rows older than 2 days.
-- 2. request_internal_function(name): the one way cron calls an edge
--    function. It sends the x-internal-secret header read from Vault
--    (internal_trigger_secret), like our other internal callers. The
--    functions reject any call without it.
-- 3. Every cron job that called an edge function directly (some with no
--    credentials, one with a service-role key from database settings) is
--    rescheduled to use request_internal_function, keeping its live schedule
--    (or a default if the job doesn't exist yet):
--      review-reminders            (was 'review-reminders-daily', 0 9 * * *)
--      trust-strike-emails         (was 'trust-strike-emails-daily', 30 9 * * *)
--      sit-checkin-reminders       (hourly; sends at 6pm in each home's time)
--      reliability-strike-emails   (created outside the repo; default 45 9 * * *)
--      send-arrival-vault-prompt   (created outside the repo; default 0 10 * * *)
--    privacy-retention already uses its own Vault-backed caller (unchanged).
--
-- SECRETS: none here; the secret is read from Vault at call time.


-- ─── 1. Contact form rate limits ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contact_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  email_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_rate_limits_ip_idx ON public.contact_rate_limits (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS contact_rate_limits_email_idx ON public.contact_rate_limits (email_hash, created_at);

ALTER TABLE public.contact_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_rate_limits FROM anon, authenticated;
GRANT ALL ON public.contact_rate_limits TO service_role;
-- No policies: members and visitors can't read or write it.


-- ─── 2. Vault-backed internal caller ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.request_internal_function(p_function text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
  v_request bigint;
BEGIN
  IF p_function !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Invalid function name';
  END IF;

  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'internal_trigger_secret';
  IF v_secret IS NULL THEN
    RAISE WARNING 'internal_trigger_secret missing from vault; % not called', p_function;
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/' || p_function,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
    body    := COALESCE(p_body, '{}'::jsonb),
    timeout_milliseconds := 55000
  ) INTO v_request;
  RETURN v_request;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_internal_function(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_internal_function(text, jsonb) TO service_role;


-- ─── 3. Cron jobs: all through request_internal_function ───────────────────

DO $$
DECLARE
  j record;
  v_schedule text;
BEGIN
  FOR j IN
    SELECT * FROM (VALUES
      ('review-reminders', '0 9 * * *'),
      ('trust-strike-emails', '30 9 * * *'),
      ('sit-checkin-reminders', '0 * * * *'),
      ('reliability-strike-emails', '45 9 * * *'),
      ('send-arrival-vault-prompt', '0 10 * * *')
    ) AS v(fn, default_schedule)
  LOOP
    -- Keep the live schedule: the job already rescheduled here (by name), or
    -- the old job that called the function's URL directly.
    SELECT schedule INTO v_schedule
    FROM cron.job
    WHERE jobname = j.fn
       OR command LIKE '%functions/v1/' || j.fn || '%'
    ORDER BY (jobname = j.fn) DESC, jobid
    LIMIT 1;

    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = j.fn
       OR command LIKE '%functions/v1/' || j.fn || '%';

    PERFORM cron.schedule(
      j.fn,
      COALESCE(v_schedule, j.default_schedule),
      format('SELECT public.request_internal_function(%L);', j.fn)
    );
    RAISE NOTICE 'cron % -> % (%)', j.fn, COALESCE(v_schedule, j.default_schedule),
      CASE WHEN v_schedule IS NULL THEN 'default schedule' ELSE 'kept live schedule' END;
  END LOOP;
END;
$$;