-- Batch F1i: phone verification limits (server side).
--
-- verify-phone-start let any signed-in member send unlimited codes to any
-- number, and ran a paid Twilio Lookup on every request. From F1i the edge
-- functions ask the database first, through service-role-only functions:
--   record_phone_verify_attempt: per member, at most 3 sends in 10 minutes,
--     10 a day and 3 different numbers a day (checks: 3 in 10 minutes, 10 a
--     day); records the attempt only when allowed, atomically.
--   phone_lookup_needed: the Twilio Lookup runs once per member and number.
--   phone_send_matches: a code is checked only for the number this member
--     last started with.
--   phone_number_taken: a number already verified on another account.
--   purge_phone_verify_attempts: rows older than 30 days (privacy-retention).
-- phone_verify_attempts keeps a keyed hash of the number (HMAC, made in the
-- edge function), never the number. No member or visitor access at all.
--
-- (The Stripe part of F1i is edge-function code only: no database change.)

CREATE TABLE IF NOT EXISTS public.phone_verify_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  phone_hash text NOT NULL CHECK (phone_hash ~ '^[0-9a-f]{64}$'),
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'check', 'lookup')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_verify_attempts_user_time ON public.phone_verify_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS phone_verify_attempts_created ON public.phone_verify_attempts (created_at);

ALTER TABLE public.phone_verify_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.phone_verify_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.phone_verify_attempts TO service_role;
-- No policies: members and visitors can't read or write it.

-- ── Limits: check and record in one step ────────────────────────────────
-- Returns 'ok' (recorded) or 'too_many' (nothing recorded, send nothing).
CREATE OR REPLACE FUNCTION public.record_phone_verify_attempt(p_user_id uuid, p_phone_hash text, p_channel text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := CASE WHEN p_channel IN ('sms', 'whatsapp') THEN 'send' WHEN p_channel = 'check' THEN 'check' ELSE NULL END;
  v_recent integer;
  v_day integer;
  v_numbers integer;
BEGIN
  IF p_user_id IS NULL OR v_kind IS NULL OR p_phone_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid attempt' USING ERRCODE = '22023';
  END IF;
  -- One member's attempts are counted one at a time.
  PERFORM pg_advisory_xact_lock(hashtextextended('phone_verify:' || p_user_id::text, 0));

  SELECT count(*) FILTER (WHERE created_at > now() - interval '10 minutes'),
         count(*)
    INTO v_recent, v_day
  FROM public.phone_verify_attempts
  WHERE user_id = p_user_id
    AND created_at > now() - interval '1 day'
    AND (CASE WHEN v_kind = 'send' THEN channel IN ('sms', 'whatsapp') ELSE channel = 'check' END);

  IF v_recent >= 3 OR v_day >= 10 THEN
    RETURN 'too_many';
  END IF;

  IF v_kind = 'send' THEN
    SELECT count(DISTINCT phone_hash) INTO v_numbers
    FROM public.phone_verify_attempts
    WHERE user_id = p_user_id AND channel IN ('sms', 'whatsapp')
      AND created_at > now() - interval '1 day' AND phone_hash <> p_phone_hash;
    IF v_numbers >= 3 THEN
      RETURN 'too_many';
    END IF;
  END IF;

  INSERT INTO public.phone_verify_attempts (user_id, phone_hash, channel) VALUES (p_user_id, p_phone_hash, p_channel);
  RETURN 'ok';
END;
$$;

-- ── Twilio Lookup once per member and number ────────────────────────────
-- True the first time (and records it); false after.
CREATE OR REPLACE FUNCTION public.phone_lookup_needed(p_user_id uuid, p_phone_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_phone_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('phone_lookup:' || p_user_id::text || p_phone_hash, 0));
  IF EXISTS (SELECT 1 FROM public.phone_verify_attempts
             WHERE user_id = p_user_id AND phone_hash = p_phone_hash AND channel = 'lookup') THEN
    RETURN false;
  END IF;
  INSERT INTO public.phone_verify_attempts (user_id, phone_hash, channel) VALUES (p_user_id, p_phone_hash, 'lookup');
  RETURN true;
END;
$$;

-- ── A code only for the number this member last started with ─────────────
CREATE OR REPLACE FUNCTION public.phone_send_matches(p_user_id uuid, p_phone_hash text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT a.phone_hash = p_phone_hash
    FROM public.phone_verify_attempts a
    WHERE a.user_id = p_user_id AND a.channel IN ('sms', 'whatsapp')
      AND a.created_at > now() - interval '30 minutes'
    ORDER BY a.created_at DESC
    LIMIT 1
  ), false);
$$;

-- ── Already verified on another account ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.phone_number_taken(p_user_id uuid, p_phone_number text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.phone_number = p_phone_number
      AND p.phone_verified IS TRUE
      AND p.id <> p_user_id
  );
$$;

-- ── Retention: 30 days ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_phone_verify_attempts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  DELETE FROM public.phone_verify_attempts WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.record_phone_verify_attempt(uuid, text, text)',
    'public.phone_lookup_needed(uuid, text)',
    'public.phone_send_matches(uuid, text)',
    'public.phone_number_taken(uuid, text)',
    'public.purge_phone_verify_attempts()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END;
$$;
