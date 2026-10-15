-- Batch F1i: proof that the live database matches 20261015210000_batch_f1i.sql.
-- READ-ONLY. One row per check; every row should have ok = true.
-- The Stripe part (no customer is ever picked by email) is edge-function
-- code: its static check is src/test/f1i.test.ts (npm test), which fails if
-- any edge function looks a Stripe customer or a member up by email.

SELECT 'phone_verify_attempts: no member or visitor access' AS item, 'RLS on, no policies, no privileges for anon or authenticated' AS expected,
       CASE WHEN to_regclass('public.phone_verify_attempts') IS NULL THEN 'missing'
            ELSE format('rls %s, policies %s, member %s, visitor %s',
                        (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.phone_verify_attempts'::regclass),
                        (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'phone_verify_attempts'),
                        has_table_privilege('authenticated', 'public.phone_verify_attempts', 'SELECT,INSERT,UPDATE,DELETE')
                          OR has_any_column_privilege('authenticated', 'public.phone_verify_attempts', 'SELECT,INSERT,UPDATE'),
                        has_table_privilege('anon', 'public.phone_verify_attempts', 'SELECT,INSERT,UPDATE,DELETE')
                          OR has_any_column_privilege('anon', 'public.phone_verify_attempts', 'SELECT,INSERT,UPDATE')) END AS actual,
       to_regclass('public.phone_verify_attempts') IS NOT NULL
         AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.phone_verify_attempts'::regclass)
         AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'phone_verify_attempts')
         AND NOT has_table_privilege('authenticated', 'public.phone_verify_attempts', 'SELECT,INSERT,UPDATE,DELETE')
         AND NOT has_any_column_privilege('authenticated', 'public.phone_verify_attempts', 'SELECT,INSERT,UPDATE')
         AND NOT has_table_privilege('anon', 'public.phone_verify_attempts', 'SELECT,INSERT,UPDATE,DELETE')
         AND NOT has_any_column_privilege('anon', 'public.phone_verify_attempts', 'SELECT,INSERT,UPDATE') AS ok

UNION ALL
SELECT 'phone_verify_attempts holds hashes, never numbers', 'columns id, user_id, phone_hash, channel, created_at; hash must be 64 hex',
       COALESCE((SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'phone_verify_attempts'), 'missing'),
       (SELECT array_agg(column_name::text ORDER BY column_name) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'phone_verify_attempts')
         = ARRAY['channel', 'created_at', 'id', 'phone_hash', 'user_id']
         AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.phone_verify_attempts'::regclass
                     AND pg_get_constraintdef(oid) ~ 'phone_hash' AND pg_get_constraintdef(oid) ~ '64')

UNION ALL
SELECT format('function %s', f.sig), 'definer, search_path=public, server only',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE format('definer %s, %s, member %s, visitor %s, server %s', p.prosecdef, COALESCE(array_to_string(p.proconfig, ','), 'no search_path'),
                        has_function_privilege('authenticated', p.oid, 'EXECUTE'), has_function_privilege('anon', p.oid, 'EXECUTE'),
                        has_function_privilege('service_role', p.oid, 'EXECUTE')) END,
       p.oid IS NOT NULL AND p.prosecdef AND COALESCE(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
         AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
         AND has_function_privilege('service_role', p.oid, 'EXECUTE')
FROM (VALUES
  ('public.record_phone_verify_attempt(uuid,text,text)'),
  ('public.phone_lookup_needed(uuid,text)'),
  ('public.phone_send_matches(uuid,text)'),
  ('public.phone_number_taken(uuid,text)'),
  ('public.purge_phone_verify_attempts()')
) AS f(sig)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT 'limits: 3 in 10 minutes, 10 a day, 3 numbers a day', 'in record_phone_verify_attempt',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE format('10 min %s, day %s, numbers %s', p.prosrc ~ '10 minutes', p.prosrc ~ '1 day', p.prosrc ~ 'v_numbers >= 3') END,
       p.oid IS NOT NULL AND p.prosrc ~ 'v_recent >= 3' AND p.prosrc ~ 'v_day >= 10' AND p.prosrc ~ 'v_numbers >= 3'
         AND p.prosrc ~ '10 minutes' AND p.prosrc ~ 'pg_advisory_xact_lock'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.record_phone_verify_attempt(uuid,text,text)')

UNION ALL
SELECT 'profiles.stripe_customer_id: not member-writable', 'no UPDATE or INSERT for members or visitors; guarded',
       format('member update %s, member insert %s, visitor update %s, guard %s',
              has_column_privilege('authenticated', 'public.profiles', 'stripe_customer_id', 'UPDATE'),
              has_column_privilege('authenticated', 'public.profiles', 'stripe_customer_id', 'INSERT'),
              has_column_privilege('anon', 'public.profiles', 'stripe_customer_id', 'UPDATE'),
              COALESCE((SELECT prosrc ~ 'stripe_customer_id' FROM pg_proc WHERE oid = to_regprocedure('public.prevent_privilege_escalation()')), false)),
       NOT has_column_privilege('authenticated', 'public.profiles', 'stripe_customer_id', 'UPDATE')
         AND NOT has_column_privilege('authenticated', 'public.profiles', 'stripe_customer_id', 'INSERT')
         AND NOT has_column_privilege('anon', 'public.profiles', 'stripe_customer_id', 'UPDATE')

UNION ALL
SELECT 'profiles.stripe_customer_id: not readable by other members', 'no SELECT for members or visitors; no member function returns it',
       format('member select %s, visitor select %s, member functions %s',
              has_column_privilege('authenticated', 'public.profiles', 'stripe_customer_id', 'SELECT'),
              has_column_privilege('anon', 'public.profiles', 'stripe_customer_id', 'SELECT'),
              COALESCE((SELECT string_agg(p.proname, ', ') FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                        AND p.prosrc ~ 'stripe_customer_id' AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
                        AND p.proname NOT IN ('prevent_privilege_escalation')), 'none')),
       NOT has_column_privilege('authenticated', 'public.profiles', 'stripe_customer_id', 'SELECT')
         AND NOT has_column_privilege('anon', 'public.profiles', 'stripe_customer_id', 'SELECT')
         AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                         AND p.prosrc ~ 'stripe_customer_id' AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
                         AND p.proname NOT IN ('prevent_privilege_escalation'))

ORDER BY ok, item;
