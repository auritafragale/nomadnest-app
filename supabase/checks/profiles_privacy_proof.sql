-- Profiles privacy: proof that the live database matches 20260928140000_profiles_privacy.sql.
-- READ-ONLY. One row per check; every row should have ok = true.

WITH
member_cols AS (
  SELECT c.column_name,
         has_column_privilege('authenticated', 'public.profiles', c.column_name, 'SELECT') AS member_can,
         has_column_privilege('anon', 'public.profiles', c.column_name, 'SELECT') AS anon_can
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'profiles'
),
view_cols AS (
  SELECT string_agg(column_name, ', ' ORDER BY column_name) AS cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'public_profiles'
),
-- Every public table or view signed-out visitors can read (column or table
-- privilege), with the reason it's allowed.
anon_readable AS (
  SELECT c.relname AS name
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind IN ('r', 'v', 'm', 'p')
    AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_any_column_privilege('anon', c.oid, 'SELECT'))
),
allowed(name, reason) AS (VALUES
  ('listings', 'Browse sits and listing pages (published listings only; exact address and coordinates are column-revoked)'),
  ('pets', 'Pets shown on published listings (private care columns revoked)'),
  ('sit_dates', 'Open dates on published listings'),
  ('reviews', 'Ratings on listing cards (private flag columns revoked)'),
  ('perks', 'Public perks page (active perks only)')
)

SELECT 'profiles: anon has no policy' AS item, 'none' AS expected,
       COALESCE((SELECT string_agg(policyname, ', ') FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'profiles' AND 'anon' = ANY (roles)), 'none') AS actual,
       NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND 'anon' = ANY (roles)) AS ok

UNION ALL
SELECT 'profiles: anon can read no column', '(none)',
       COALESCE(string_agg(column_name, ', ' ORDER BY column_name) FILTER (WHERE anon_can), '(none)'),
       NOT bool_or(anon_can)
FROM member_cols

UNION ALL
SELECT 'profiles: member-readable columns', 'avatar_url, bio, city, country, created_at, email_verified, first_name, founding_badge, id, id_verified, phone_verified, updated_at',
       COALESCE(string_agg(column_name, ', ' ORDER BY column_name) FILTER (WHERE member_can), '(none)'),
       COALESCE(string_agg(column_name, ', ' ORDER BY column_name) FILTER (WHERE member_can), '(none)')
         = 'avatar_url, bio, city, country, created_at, email_verified, first_name, founding_badge, id, id_verified, phone_verified, updated_at'
FROM member_cols

UNION ALL
SELECT 'public_profiles columns', 'avatar_url, bio, city, country, email_verified, first_name, founding_member, id, id_verified, phone_verified',
       cols, cols = 'avatar_url, bio, city, country, email_verified, first_name, founding_member, id, id_verified, phone_verified'
FROM view_cols

UNION ALL
SELECT 'public_profiles: invoker rights, members only', 'security_invoker, anon false, member true',
       COALESCE((SELECT array_to_string(reloptions, ',') FROM pg_class WHERE oid = 'public.public_profiles'::regclass), 'no options')
         || ', anon ' || has_table_privilege('anon', 'public.public_profiles', 'SELECT')::text
         || ', member ' || has_table_privilege('authenticated', 'public.public_profiles', 'SELECT')::text,
       COALESCE((SELECT 'security_invoker=true' = ANY (reloptions) FROM pg_class WHERE oid = 'public.public_profiles'::regclass), false)
         AND NOT has_table_privilege('anon', 'public.public_profiles', 'SELECT')
         AND has_table_privilege('authenticated', 'public.public_profiles', 'SELECT')

UNION ALL
SELECT 'get_my_profile: members only, own row', 'member true, anon false, auth.uid() filter',
       has_function_privilege('authenticated', 'public.get_my_profile()', 'EXECUTE')::text || ' / '
         || has_function_privilege('anon', 'public.get_my_profile()', 'EXECUTE')::text,
       has_function_privilege('authenticated', 'public.get_my_profile()', 'EXECUTE')
         AND NOT has_function_privilege('anon', 'public.get_my_profile()', 'EXECUTE')
         AND position('p.id = auth.uid()' IN pg_get_functiondef('public.get_my_profile()'::regprocedure)) > 0

UNION ALL
SELECT 'get_public_member_cards: first name and photo only', 'id, first_name, avatar_url',
       CASE WHEN position('last_name' IN pg_get_functiondef('public.get_public_member_cards(uuid[])'::regprocedure)) > 0
              OR position('city' IN pg_get_functiondef('public.get_public_member_cards(uuid[])'::regprocedure)) > 0
            THEN 'returns more' ELSE 'id, first_name, avatar_url' END,
       position('last_name' IN pg_get_functiondef('public.get_public_member_cards(uuid[])'::regprocedure)) = 0
         AND position('city' IN pg_get_functiondef('public.get_public_member_cards(uuid[])'::regprocedure)) = 0

UNION ALL
SELECT format('function %s: first names only', f), 'no last_name',
       CASE WHEN position('last_name' IN pg_get_functiondef(format('public.%s()', f)::regprocedure)) > 0 THEN 'uses last_name' ELSE 'no last_name' END,
       position('last_name' IN pg_get_functiondef(format('public.%s()', f)::regprocedure)) = 0
FROM (VALUES ('notify_review_received'), ('notify_city_chat_thread_subscribers')) AS v(f)

UNION ALL
SELECT format('anon can read %s', a.name), COALESCE(al.reason, 'not expected'),
       CASE WHEN al.name IS NULL THEN 'readable, not on the allowed list' ELSE 'allowed' END,
       al.name IS NOT NULL
FROM anon_readable a LEFT JOIN allowed al ON al.name = a.name

UNION ALL
SELECT format('%s: no signed-out access', t), 'no anon policy, no anon column',
       COALESCE((SELECT string_agg(policyname, ', ') FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = t AND ('anon' = ANY (roles) OR 'public' = ANY (roles))
                   AND cmd IN ('SELECT', 'ALL')), 'no anon policy')
         || ', anon column read ' || has_any_column_privilege('anon', format('public.%I', t), 'SELECT')::text,
       NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t
                   AND ('anon' = ANY (roles) OR 'public' = ANY (roles)) AND cmd IN ('SELECT', 'ALL'))
         AND NOT has_any_column_privilege('anon', format('public.%I', t), 'SELECT')
FROM (VALUES ('sitter_profiles'), ('owner_profiles')) AS v(t)

UNION ALL
SELECT 'sitter_profiles: members see visible Nomads only', 'is_active AND is_visible, own row, or shared with me',
       COALESCE((SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sitter_profiles'
                 AND policyname = 'Authenticated users can view sitter profiles'), 'missing'),
       COALESCE((SELECT position('is_visible' IN qual) > 0 AND position('nomad_profile_shared_with_me' IN qual) > 0
                 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sitter_profiles'
                 AND policyname = 'Authenticated users can view sitter profiles'), false)

UNION ALL
SELECT 'sitter_profiles: only one member SELECT policy', '1',
       count(*)::text, count(*) = 1
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'sitter_profiles' AND cmd IN ('SELECT', 'ALL')
  AND 'authenticated' = ANY (roles)

UNION ALL
SELECT 'sitter_profiles: coordinates rounded (trigger + check)', 'trigger enabled, check present, 0 precise rows',
       COALESCE((SELECT tgenabled::text FROM pg_trigger WHERE tgrelid = 'public.sitter_profiles'::regclass AND tgname = 'round_sitter_location'), 'no trigger')
         || ', ' || CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sitter_profiles_location_rounded') THEN 'check' ELSE 'no check' END
         || ', ' || (SELECT count(*) FROM public.sitter_profiles
                     WHERE latitude::numeric <> round(latitude::numeric, 2) OR longitude::numeric <> round(longitude::numeric, 2))::text || ' precise',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.sitter_profiles'::regclass AND tgname = 'round_sitter_location' AND tgenabled <> 'D')
         AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sitter_profiles_location_rounded')
         AND NOT EXISTS (SELECT 1 FROM public.sitter_profiles
                         WHERE latitude::numeric <> round(latitude::numeric, 2) OR longitude::numeric <> round(longitude::numeric, 2))

ORDER BY ok, item;
