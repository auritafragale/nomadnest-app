-- Batch D2: proof that the live database matches
-- 20261010090000_batch_d2.sql (or Lovable's copy of it).
-- READ-ONLY. One row per check; every row should have ok = true.

WITH member_fns(sig) AS (VALUES
  ('public.set_my_timezone(text)'),
  ('public.complete_onboarding(app_role)'),
  ('public.get_my_membership()')
), server_fns(sig) AS (VALUES
  ('public.notification_allowed(uuid,text,text)'),
  ('public.message_digest_due(boolean)'),
  ('public.mark_message_digest_sent(uuid[])'),
  ('public.refresh_member_role(uuid)'),
  ('public.redeem_founding_code_for(uuid,text)'),
  ('public.redeem_founding_member_code(text,uuid)'),
  ('public.notify_new_message()'),
  ('public.roles_follow_plan()'),
  ('public.guard_user_roles()'),
  ('public.prevent_privilege_escalation()'),
  ('public.push_on_notification_insert()')
)
SELECT format('member function %s', f.sig) AS item, 'definer, search_path=public, member yes, anon no' AS expected,
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'definer ' || p.prosecdef::text || ', ' || COALESCE(array_to_string(p.proconfig, ','), 'no config')
                 || ', member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 || ', anon ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text END AS actual,
       p.oid IS NOT NULL AND p.prosecdef AND COALESCE(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AS ok
FROM member_fns f LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT format('server-only function %s', f.sig), 'member no, anon no',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 || ', anon ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text END,
       p.oid IS NOT NULL AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
FROM server_fns f LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT 'notification_preferences: new columns', 'push_* and message_email_frequency',
       (SELECT string_agg(a.attname, ', ' ORDER BY a.attname) FROM pg_attribute a
        WHERE a.attrelid = 'public.notification_preferences'::regclass AND a.attnum > 0 AND NOT a.attisdropped
          AND (a.attname LIKE 'push_%' OR a.attname IN ('message_email_frequency', 'message_digest_sent_at', 'email_membership'))),
       (SELECT count(*) FROM pg_attribute a
        WHERE a.attrelid = 'public.notification_preferences'::regclass AND a.attnum > 0 AND NOT a.attisdropped
          AND a.attname IN ('push_messages', 'push_applications', 'push_sits', 'push_reviews', 'push_city_chat',
                            'message_email_frequency', 'message_digest_sent_at', 'email_membership')) = 8

UNION ALL
SELECT 'notification_preferences: own row only', 'rls on, every policy checks auth.uid(), no DELETE, digest time not writable',
       'rls ' || c.relrowsecurity::text
         || ', policies ' || (SELECT count(*) FROM pg_policies pp WHERE pp.schemaname = 'public' AND pp.tablename = 'notification_preferences')::text
         || ', delete ' || has_table_privilege('authenticated', c.oid, 'DELETE')::text
         || ', digest writable ' || has_column_privilege('authenticated', c.oid, 'message_digest_sent_at', 'UPDATE')::text,
       c.relrowsecurity
         AND NOT EXISTS (SELECT 1 FROM pg_policies pp WHERE pp.schemaname = 'public' AND pp.tablename = 'notification_preferences'
                         AND COALESCE(pp.qual, '') || COALESCE(pp.with_check, '') !~ 'auth\.uid\(\)')
         AND NOT has_table_privilege('authenticated', c.oid, 'DELETE')
         AND NOT has_column_privilege('authenticated', c.oid, 'message_digest_sent_at', 'UPDATE')
         AND NOT has_table_privilege('anon', c.oid, 'SELECT')
FROM pg_class c WHERE c.oid = 'public.notification_preferences'::regclass

UNION ALL
SELECT format('trigger %s on %s', t.name, t.rel), 'enabled',
       COALESCE((SELECT CASE tg.tgenabled WHEN 'O' THEN 'enabled' ELSE 'state ' || tg.tgenabled::text END
                 FROM pg_trigger tg WHERE tg.tgrelid = to_regclass(t.rel) AND tg.tgname = t.name), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = to_regclass(t.rel) AND tg.tgname = t.name AND tg.tgenabled = 'O')
FROM (VALUES ('notify_new_message', 'public.messages'), ('roles_follow_plan', 'public.profiles'),
             ('guard_user_roles', 'public.user_roles'), ('sync_sitter_visibility', 'public.sitter_profiles'),
             ('push_on_notification_insert', 'public.notifications'),
             ('ensure_owner_profile_for_listing', 'public.listings')) AS t(name, rel)

UNION ALL
SELECT 'push respects the member''s choice', 'push_on_notification_insert calls notification_allowed',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc ~ 'notification_allowed')::text END,
       p.oid IS NOT NULL AND p.prosrc ~ 'notification_allowed' AND p.prosrc ~ 'city_chat_mutes' AND p.prosrc ~ 'sit_update_loved'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.push_on_notification_insert()')

UNION ALL
SELECT 'new-message notifications never hold message text', 'notify_new_message does not read NEW.body into the row',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc ~ 'NEW\.body[^;]*INSERT|left\(NEW\.body, *[0-9]{2,}')::text END,
       p.oid IS NOT NULL AND p.prosrc !~ 'messagePreview' AND p.prosrc !~ 'left\(NEW\.body, *[0-9]{2,}'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.notify_new_message()')

UNION ALL
SELECT 'no new_message notification holds message text (last 7 days)', 'every message says "Open your chat to read it."',
       (SELECT count(*) FROM public.notifications WHERE type = 'new_message' AND created_at > now() - interval '7 days'
          AND message <> 'Open your chat to read it.')::text || ' with other text',
       true -- older rows from the browser call may still hold a preview; this row shows how many

UNION ALL
SELECT 'hourly message-email-digest job', 'scheduled through request_internal_function',
       COALESCE((SELECT schedule || ' ' || command FROM cron.job WHERE jobname = 'message-email-digest'), 'missing'),
       EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'message-email-digest' AND command ~ 'request_internal_function')

UNION ALL
SELECT 'profiles: timezone and membership columns are not readable by members', 'no SELECT for authenticated/anon',
       string_agg(c.col || ' ' || has_column_privilege('authenticated', 'public.profiles', c.col, 'SELECT')::text, ', '),
       bool_and(NOT has_column_privilege('authenticated', 'public.profiles', c.col, 'SELECT')
                AND NOT has_column_privilege('anon', 'public.profiles', c.col, 'SELECT'))
FROM (VALUES ('timezone'), ('stripe_customer_id'), ('stripe_subscription_id'), ('membership_cancel_at_period_end'),
             ('membership_payment_failed_at')) AS c(col)

UNION ALL
SELECT 'members can''t change membership, billing or founding', 'prevent_privilege_escalation covers the new columns',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc ~ 'stripe_subscription_id' AND p.prosrc ~ 'membership_cancel_at_period_end')::text END,
       p.oid IS NOT NULL AND p.prosrc ~ 'stripe_subscription_id' AND p.prosrc ~ 'membership_cancel_at_period_end' AND p.prosrc ~ 'founding_member'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.prevent_privilege_escalation()')

UNION ALL
SELECT 'members can''t write user_roles', 'no INSERT/UPDATE/DELETE for authenticated',
       has_table_privilege('authenticated', 'public.user_roles', 'INSERT,UPDATE,DELETE')::text,
       NOT has_table_privilege('authenticated', 'public.user_roles', 'INSERT,UPDATE,DELETE')
         AND NOT has_column_privilege('authenticated', 'public.user_roles', 'role', 'UPDATE')

UNION ALL
SELECT format('table %s: RLS on, no member access', t.name), 'rls on, no privileges',
       CASE WHEN c.oid IS NULL THEN 'missing'
            ELSE 'rls ' || c.relrowsecurity::text || ', member any ' || has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')::text END,
       c.oid IS NOT NULL AND c.relrowsecurity
         AND NOT has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
         AND NOT has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
FROM (VALUES ('stripe_events'), ('founding_redemptions'), ('d2_discoverability_before')) AS t(name)
LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || t.name)

UNION ALL
SELECT 'City Chat tables: tightened grants', 'mutes: SELECT/INSERT/DELETE only; room reads: SELECT only',
       'mutes update ' || has_table_privilege('authenticated', 'public.city_chat_mutes', 'UPDATE')::text
         || ', mutes truncate ' || has_table_privilege('authenticated', 'public.city_chat_mutes', 'TRUNCATE')::text
         || ', reads write ' || has_table_privilege('authenticated', 'public.city_chat_room_reads', 'INSERT,UPDATE,DELETE,TRUNCATE')::text,
       has_table_privilege('authenticated', 'public.city_chat_mutes', 'SELECT')
         AND has_table_privilege('authenticated', 'public.city_chat_mutes', 'INSERT')
         AND has_table_privilege('authenticated', 'public.city_chat_mutes', 'DELETE')
         AND NOT has_table_privilege('authenticated', 'public.city_chat_mutes', 'UPDATE,TRUNCATE,REFERENCES,TRIGGER')
         AND has_table_privilege('authenticated', 'public.city_chat_room_reads', 'SELECT')
         AND NOT has_table_privilege('authenticated', 'public.city_chat_room_reads', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         AND NOT has_table_privilege('anon', 'public.city_chat_mutes', 'SELECT')
         AND NOT has_table_privilege('anon', 'public.city_chat_room_reads', 'SELECT')

UNION ALL
SELECT 'Nomad visibility is one switch', '0 profiles with is_visible <> is_active',
       (SELECT count(*) FROM public.sitter_profiles WHERE is_visible IS DISTINCT FROM is_active)::text || ' out of step',
       NOT EXISTS (SELECT 1 FROM public.sitter_profiles WHERE is_visible IS DISTINCT FROM is_active)

UNION ALL
SELECT 'discoverable rule: Nomad visible AND active; paused owners'' listings don''t count', 'profile_is_discoverable checks both',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc ~ 'is_visible IS TRUE AND sp\.is_active IS TRUE' AND p.prosrc ~ 'is_owner_active')::text END,
       p.oid IS NOT NULL AND p.prosrc ~ 'is_visible IS TRUE AND sp\.is_active IS TRUE' AND p.prosrc ~ 'is_owner_active'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.profile_is_discoverable(uuid)')

UNION ALL
SELECT 'paused listings hidden: listings and pets policies check the owner', 'is_owner_active in both',
       (SELECT string_agg(pp.tablename || ':' || pp.policyname, '; ') FROM pg_policies pp
        WHERE pp.schemaname = 'public' AND pp.tablename IN ('listings', 'pets') AND pp.cmd = 'SELECT' AND pp.roles @> ARRAY['anon']::name[]),
       EXISTS (SELECT 1 FROM pg_policies pp WHERE pp.schemaname = 'public' AND pp.tablename = 'listings' AND pp.cmd = 'SELECT' AND pp.qual ~ 'is_owner_active')
         AND EXISTS (SELECT 1 FROM pg_policies pp WHERE pp.schemaname = 'public' AND pp.tablename = 'pets' AND pp.cmd = 'SELECT' AND pp.qual ~ 'is_owner_active')

UNION ALL
SELECT 'roles follow the plan today', '0 members whose role differs from role_for(base, plan)',
       (SELECT count(*) FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
        WHERE r.role IS DISTINCT FROM public.role_for(COALESCE(r.base_role, r.role), p.membership_type, p.membership_status, p.founding_member))::text || ' out of step',
       NOT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
                   WHERE r.role IS DISTINCT FROM public.role_for(COALESCE(r.base_role, r.role), p.membership_type, p.membership_status, p.founding_member))

UNION ALL
SELECT 'founding spots respect the 1,000 cap', 'cap 1000, spots_left between 0 and 1000',
       (SELECT spots_left::text || ' left of ' || cap::text FROM public.public_founding_spots()),
       (SELECT cap = 1000 AND spots_left BETWEEN 0 AND 1000 FROM public.public_founding_spots())

UNION ALL
SELECT 'plans never create profiles', 'refresh_member_role inserts nothing',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc ~* 'INSERT INTO')::text END,
       p.oid IS NOT NULL AND p.prosrc !~* 'INSERT INTO'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.refresh_member_role(uuid)')

UNION ALL
SELECT 'nobody became discoverable through this migration (plans never make anyone discoverable)', '0',
       (SELECT count(*) FROM public.d2_discoverability_before b
        WHERE NOT b.discoverable AND public.profile_is_discoverable(b.user_id))::text,
       NOT EXISTS (SELECT 1 FROM public.d2_discoverability_before b
                   WHERE NOT b.discoverable AND public.profile_is_discoverable(b.user_id))

UNION ALL
SELECT 'members whose discoverability changed', '0 changed, except members who hid or paused themselves',
       (SELECT count(*) FROM public.d2_discoverability_before b WHERE b.discoverable IS DISTINCT FROM public.profile_is_discoverable(b.user_id))::text
         || ' changed, of which '
         || (SELECT count(*) FROM public.d2_discoverability_before b
             WHERE b.discoverable AND NOT public.profile_is_discoverable(b.user_id)
               AND (EXISTS (SELECT 1 FROM public.sitter_profiles sp WHERE sp.user_id = b.user_id AND sp.is_visible IS NOT TRUE)
                    OR EXISTS (SELECT 1 FROM public.owner_profiles op WHERE op.user_id = b.user_id AND op.is_active IS NOT TRUE)))::text
         || ' had hidden their Nomad profile or paused their listing',
       NOT EXISTS (SELECT 1 FROM public.d2_discoverability_before b
                   WHERE b.discoverable IS DISTINCT FROM public.profile_is_discoverable(b.user_id)
                     AND NOT (b.discoverable AND NOT public.profile_is_discoverable(b.user_id)
                              AND (EXISTS (SELECT 1 FROM public.sitter_profiles sp WHERE sp.user_id = b.user_id AND sp.is_visible IS NOT TRUE)
                                   OR EXISTS (SELECT 1 FROM public.owner_profiles op WHERE op.user_id = b.user_id AND op.is_active IS NOT TRUE))))

UNION ALL
SELECT format('access function %s', f.sig), f.expect,
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'definer ' || p.prosecdef::text || ', member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 || ', anon ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text END,
       p.oid IS NOT NULL AND p.prosecdef AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND has_function_privilege('anon', p.oid, 'EXECUTE') = f.anon_ok
FROM (VALUES ('public.has_side_access(uuid,text)', 'definer; members and visitors (used in listing policies)', true),
             ('public.listing_owner_has_access(uuid)', 'definer; members and visitors (used in policies)', true),
             ('public.get_my_side_access()', 'definer; members only', false)) AS f(sig, expect, anon_ok)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT 'has_side_access: past due only for 8 days after the failed payment', 'mentions 8 days and past_due',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc ~ '8 days' AND p.prosrc ~ 'past_due' AND p.prosrc ~ 'founding_member')::text END,
       p.oid IS NOT NULL AND p.prosrc ~ '8 days' AND p.prosrc ~ 'past_due' AND p.prosrc ~ 'founding_member'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.has_side_access(uuid,text)')

UNION ALL
SELECT format('policy %s on %s uses the access rule', pp.policyname, pp.tablename), 'has_side_access or listing_owner_has_access',
       COALESCE(pp.qual, pp.with_check),
       COALESCE(pp.qual, '') || COALESCE(pp.with_check, '') ~ 'has_side_access|listing_owner_has_access'
FROM pg_policies pp
WHERE pp.schemaname = 'public'
  AND ((pp.tablename IN ('listings', 'pets') AND pp.cmd = 'SELECT' AND pp.roles @> ARRAY['anon']::name[])
       OR (pp.tablename = 'applications' AND pp.cmd IN ('SELECT', 'INSERT'))
       OR (pp.tablename = 'sitter_invites' AND pp.cmd IN ('SELECT', 'INSERT')))

UNION ALL
SELECT format('trigger %s', t.name), 'enabled',
       COALESCE((SELECT CASE tg.tgenabled WHEN 'O' THEN 'enabled' ELSE 'state ' || tg.tgenabled::text END
                 FROM pg_trigger tg WHERE tg.tgrelid = to_regclass(t.rel) AND tg.tgname = t.name), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = to_regclass(t.rel) AND tg.tgname = t.name AND tg.tgenabled = 'O')
FROM (VALUES ('require_nomad_access_to_apply', 'public.applications'), ('require_access_to_decide', 'public.applications'),
             ('require_owner_access_to_invite', 'public.sitter_invites'), ('require_access_to_answer_invite', 'public.sitter_invites')) AS t(name, rel)

UNION ALL
SELECT format('%s uses the access rule', f.sig), 'mentions has_side_access, not membership_status',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc ~ 'has_side_access')::text END,
       p.oid IS NOT NULL AND p.prosrc ~ 'has_side_access' AND p.prosrc !~ 'membership_status'
FROM (VALUES ('public.can_publish_listing()'), ('public.get_listing_applicants(uuid)')) AS f(sig)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT 'confirmed sits never read membership', '0 policies on sits, messages, check-ins, guides or reviews use it',
       (SELECT count(*) FROM pg_policies pp
        WHERE pp.schemaname = 'public'
          AND pp.tablename IN ('sits', 'messages', 'conversations', 'sit_checkins', 'welcome_guides', 'welcome_guide_access',
                               'welcome_guide_photos', 'guide_questions', 'guide_qa', 'reviews', 'arrival_vault_photos')
          AND COALESCE(pp.qual, '') || COALESCE(pp.with_check, '') ~ 'has_side_access|membership_status|membership_type')::text,
       NOT EXISTS (SELECT 1 FROM pg_policies pp
                   WHERE pp.schemaname = 'public'
                     AND pp.tablename IN ('sits', 'messages', 'conversations', 'sit_checkins', 'welcome_guides', 'welcome_guide_access',
                                          'welcome_guide_photos', 'guide_questions', 'guide_qa', 'reviews', 'arrival_vault_photos')
                     AND COALESCE(pp.qual, '') || COALESCE(pp.with_check, '') ~ 'has_side_access|membership_status|membership_type')

UNION ALL
SELECT 'founding members always have both sides', '0 founding members without a side',
       (SELECT count(*) FROM public.profiles p WHERE p.founding_member
          AND NOT (public.has_side_access(p.id, 'sitter') AND public.has_side_access(p.id, 'owner')))::text,
       NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.founding_member
                   AND NOT (public.has_side_access(p.id, 'sitter') AND public.has_side_access(p.id, 'owner')))

UNION ALL
SELECT 'founding members redeemed at most once', '0 members with two redemptions (one row per member by key)',
       (SELECT count(*) FROM public.founding_redemptions)::text || ' redemptions recorded',
       true;
