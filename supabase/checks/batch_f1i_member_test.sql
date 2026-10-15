-- Batch F1i: behaviour test for phone verification limits and Stripe ids.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- It uses made-up hashes (64 hex characters), never phone numbers, and a
-- made-up number "+99900000001" for the "taken" check. Needs two non-admin
-- members.

DO $$
DECLARE
  v_a uuid;
  v_b uuid;
  h1 constant text := repeat('a', 64);
  h2 constant text := repeat('b', 64);
  h3 constant text := repeat('c', 64);
  h4 constant text := repeat('d', 64);
  v_res text;
  v_raised boolean;
  v_stmt text;
  i integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT id INTO v_a FROM public.profiles WHERE is_admin IS NOT TRUE ORDER BY created_at LIMIT 1;
  SELECT id INTO v_b FROM public.profiles WHERE is_admin IS NOT TRUE AND id <> v_a ORDER BY created_at LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL THEN RAISE EXCEPTION 'FAIL: needs two non-admin members'; END IF;
  -- Start clean for these members (rolled back).
  DELETE FROM public.phone_verify_attempts WHERE user_id IN (v_a, v_b);

  -- ── Members and visitors can't touch the table or the functions ───────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH v_stmt IN ARRAY ARRAY[
    'SELECT 1 FROM public.phone_verify_attempts LIMIT 1',
    format('INSERT INTO public.phone_verify_attempts (user_id, phone_hash, channel) VALUES (%L, %L, %L)', v_a, h1, 'sms'),
    format('SELECT public.record_phone_verify_attempt(%L, %L, %L)', v_a, h1, 'sms'),
    format('SELECT public.phone_number_taken(%L, %L)', v_a, '+99900000001'),
    format('SELECT public.phone_send_matches(%L, %L)', v_a, h1),
    format('UPDATE public.profiles SET stripe_customer_id = %L WHERE id = %L', 'cus_F1ITEST', v_a),
    format('SELECT stripe_customer_id FROM public.profiles WHERE id = %L', v_a)
  ] LOOP
    v_raised := false;
    BEGIN
      EXECUTE v_stmt;
    EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
    END;
    IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a member could run: %', v_stmt; END IF;
  END LOOP;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;
  v_raised := false;
  BEGIN
    PERFORM 1 FROM public.phone_verify_attempts LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  RESET ROLE;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL: a visitor could read phone_verify_attempts'; END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- ── 3 sends in 10 minutes ─────────────────────────────────────────────
  FOR i IN 1..3 LOOP
    v_res := public.record_phone_verify_attempt(v_a, h1, 'sms');
    IF v_res <> 'ok' THEN RAISE EXCEPTION 'FAIL: send % of 3 was refused', i; END IF;
  END LOOP;
  IF public.record_phone_verify_attempt(v_a, h1, 'whatsapp') <> 'too_many' THEN
    RAISE EXCEPTION 'FAIL: a 4th send in 10 minutes was allowed';
  END IF;
  IF (SELECT count(*) FROM public.phone_verify_attempts WHERE user_id = v_a AND channel IN ('sms', 'whatsapp')) <> 3 THEN
    RAISE EXCEPTION 'FAIL: a refused send was recorded';
  END IF;

  -- ── 10 a day (older sends, still today) ───────────────────────────────
  UPDATE public.phone_verify_attempts SET created_at = now() - interval '2 hours' WHERE user_id = v_a;
  INSERT INTO public.phone_verify_attempts (user_id, phone_hash, channel, created_at)
  SELECT v_a, h1, 'sms', now() - interval '3 hours' FROM generate_series(1, 7);
  IF public.record_phone_verify_attempt(v_a, h1, 'sms') <> 'too_many' THEN
    RAISE EXCEPTION 'FAIL: an 11th send in a day was allowed';
  END IF;

  -- ── 3 different numbers a day ─────────────────────────────────────────
  DELETE FROM public.phone_verify_attempts WHERE user_id = v_b;
  INSERT INTO public.phone_verify_attempts (user_id, phone_hash, channel, created_at)
  VALUES (v_b, h1, 'sms', now() - interval '2 hours'), (v_b, h2, 'sms', now() - interval '2 hours'), (v_b, h3, 'sms', now() - interval '2 hours');
  IF public.record_phone_verify_attempt(v_b, h4, 'sms') <> 'too_many' THEN
    RAISE EXCEPTION 'FAIL: a 4th different number in a day was allowed';
  END IF;
  IF public.record_phone_verify_attempt(v_b, h3, 'sms') <> 'ok' THEN
    RAISE EXCEPTION 'FAIL: one of the day''s 3 numbers was refused';
  END IF;

  -- ── A code only for the number last started with ──────────────────────
  IF NOT public.phone_send_matches(v_b, h3) THEN RAISE EXCEPTION 'FAIL: the last number started with did not match'; END IF;
  IF public.phone_send_matches(v_b, h1) THEN RAISE EXCEPTION 'FAIL: a code was accepted for an earlier number'; END IF;
  IF public.phone_send_matches(v_b, h4) THEN RAISE EXCEPTION 'FAIL: a code was accepted for a number never started'; END IF;

  -- ── Checks: 3 in 10 minutes ───────────────────────────────────────────
  FOR i IN 1..3 LOOP
    IF public.record_phone_verify_attempt(v_b, h3, 'check') <> 'ok' THEN RAISE EXCEPTION 'FAIL: check % of 3 was refused', i; END IF;
  END LOOP;
  IF public.record_phone_verify_attempt(v_b, h3, 'check') <> 'too_many' THEN
    RAISE EXCEPTION 'FAIL: a 4th code check in 10 minutes was allowed';
  END IF;

  -- ── Lookup once per member and number ─────────────────────────────────
  IF NOT public.phone_lookup_needed(v_b, h4) THEN RAISE EXCEPTION 'FAIL: the first lookup was skipped'; END IF;
  IF public.phone_lookup_needed(v_b, h4) THEN RAISE EXCEPTION 'FAIL: the lookup ran twice for one number'; END IF;

  -- ── A number verified on another account ──────────────────────────────
  UPDATE public.profiles SET phone_number = '+99900000001', phone_verified = true WHERE id = v_a;
  IF NOT public.phone_number_taken(v_b, '+99900000001') THEN RAISE EXCEPTION 'FAIL: a number verified on another account was not refused'; END IF;
  IF public.phone_number_taken(v_a, '+99900000001') THEN RAISE EXCEPTION 'FAIL: a member''s own number counted as taken'; END IF;

  -- ── Retention: older than 30 days goes ────────────────────────────────
  INSERT INTO public.phone_verify_attempts (user_id, phone_hash, channel, created_at) VALUES (v_b, h2, 'sms', now() - interval '31 days');
  PERFORM public.purge_phone_verify_attempts();
  IF EXISTS (SELECT 1 FROM public.phone_verify_attempts WHERE created_at < now() - interval '30 days') THEN
    RAISE EXCEPTION 'FAIL: attempts older than 30 days were kept';
  END IF;

  -- ── A bad hash is refused (never a raw number) ────────────────────────
  v_raised := false;
  BEGIN
    PERFORM public.record_phone_verify_attempt(v_b, '+99900000001', 'sms');
  EXCEPTION WHEN OTHERS THEN v_raised := true;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL: a raw number was accepted as a hash'; END IF;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;
