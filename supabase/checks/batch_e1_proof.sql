-- Batch E1: proof that the live database matches
-- 20261013090000_batch_e1.sql (or Lovable's copy of it).
-- READ-ONLY. One row per check; every row should have ok = true.

WITH new_tables(tbl, member_grants) AS (VALUES
  ('blocked_terms', 'DELETE,INSERT,SELECT'),
  ('member_blocks', 'DELETE,INSERT,SELECT'),
  ('review_replies', 'DELETE,SELECT'),
  ('review_ai_summaries', '')
)
SELECT format('table %s: RLS on, visitors nothing, members %s', t.tbl, COALESCE(NULLIF(t.member_grants, ''), 'nothing')) AS item,
       'exists, RLS, grants as listed' AS expected,
       CASE WHEN c.oid IS NULL THEN 'missing'
            ELSE 'rls ' || c.relrowsecurity::text
                 || ', anon ' || COALESCE((SELECT string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type)
                                            FROM aclexplode(c.relacl) a WHERE a.grantee = 'anon'::regrole), 'none')
                 || ', members ' || COALESCE((SELECT string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type)
                                               FROM aclexplode(c.relacl) a WHERE a.grantee = 'authenticated'::regrole), 'none') END AS actual,
       c.oid IS NOT NULL AND c.relrowsecurity
         AND NOT EXISTS (SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee = 'anon'::regrole)
         AND COALESCE((SELECT string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type)
                       FROM aclexplode(c.relacl) a WHERE a.grantee = 'authenticated'::regrole), '') = t.member_grants AS ok
FROM new_tables t
LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || t.tbl)

UNION ALL
SELECT 'review_facts view is server only', 'no visitor or member access, security_invoker',
       CASE WHEN c.oid IS NULL THEN 'missing'
            ELSE 'anon ' || has_table_privilege('anon', c.oid, 'SELECT')::text || ', members ' || has_table_privilege('authenticated', c.oid, 'SELECT')::text
                 || ', ' || COALESCE(array_to_string(c.reloptions, ','), 'no options') END,
       c.oid IS NOT NULL AND NOT has_table_privilege('anon', c.oid, 'SELECT') AND NOT has_table_privilege('authenticated', c.oid, 'SELECT')
         AND COALESCE(array_to_string(c.reloptions, ','), '') ~ 'security_invoker=(true|on)'
FROM (SELECT 1) one LEFT JOIN pg_class c ON c.oid = to_regclass('public.review_facts')

UNION ALL
SELECT 'grants: no TRUNCATE, TRIGGER or REFERENCES for visitors or members', '0 public tables',
       COALESCE((SELECT string_agg(DISTINCT c.relname, ', ') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 CROSS JOIN LATERAL aclexplode(c.relacl) a
                 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
                   AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
                   AND a.privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')), 'none'),
       NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                   CROSS JOIN LATERAL aclexplode(c.relacl) a
                   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
                     AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
                     AND a.privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES'))

UNION ALL
SELECT 'grants: visitors write to no table directly', '0 tables with anon INSERT, UPDATE or DELETE (table or column)',
       COALESCE((SELECT string_agg(DISTINCT c.relname, ', ') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
                   AND (has_table_privilege('anon', c.oid, 'INSERT') OR has_table_privilege('anon', c.oid, 'UPDATE')
                        OR has_table_privilege('anon', c.oid, 'DELETE')
                        OR has_any_column_privilege('anon', c.oid, 'INSERT') OR has_any_column_privilege('anon', c.oid, 'UPDATE'))), 'none'),
       NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
                     AND (has_table_privilege('anon', c.oid, 'INSERT') OR has_table_privilege('anon', c.oid, 'UPDATE')
                          OR has_table_privilege('anon', c.oid, 'DELETE')
                          OR has_any_column_privilege('anon', c.oid, 'INSERT') OR has_any_column_privilege('anon', c.oid, 'UPDATE')))

UNION ALL
SELECT 'd2_discoverability_before is gone', 'dropped',
       CASE WHEN to_regclass('public.d2_discoverability_before') IS NULL THEN 'dropped' ELSE 'still there' END,
       to_regclass('public.d2_discoverability_before') IS NULL

UNION ALL
SELECT format('function %s', f.sig), f.expect,
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'definer ' || p.prosecdef::text || ', ' || COALESCE(array_to_string(p.proconfig, ','), 'no config')
                 || ', member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 || ', anon ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text END,
       p.oid IS NOT NULL AND p.prosecdef AND COALESCE(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE') = f.member_ok
         AND has_function_privilege('anon', p.oid, 'EXECUTE') = f.anon_ok
FROM (VALUES
  ('public.blocked_between(uuid,uuid)', 'server only (never who blocked whom)', false, false),
  ('public.text_violation(text)', 'server only', false, false),
  ('public.sit_review_end(uuid)', 'server only', false, false),
  ('public.publish_due_reviews()', 'server only (review-reminders)', false, false),
  ('public.publish_sit_reviews(uuid)', 'server only', false, false),
  ('public.queue_review_summary(uuid,text)', 'server only', false, false),
  ('public.enforce_word_filter()', 'trigger only', false, false),
  ('public.cancel_sits_on_block()', 'trigger only', false, false),
  ('public.refuse_sit_across_block()', 'trigger only', false, false),
  ('public.review_before_insert()', 'trigger only', false, false),
  ('public.notify_review_reply()', 'trigger only', false, false),
  ('public.guard_report_insert()', 'trigger only', false, false),
  ('public.is_blocked_with(uuid)', 'members and visitors (yes or no about the signed-in member only)', true, true),
  ('public.hidden_by_block(uuid)', 'members and visitors (policies on listings)', true, true),
  ('public.member_ratings(uuid[],text)', 'members and visitors (averages and counts only)', true, true),
  ('public.conversation_open_to_me(uuid)', 'members only', true, false),
  ('public.listing_owner_blocked_with_me(uuid)', 'members only', true, false),
  ('public.get_my_blocked_members()', 'members only', true, false),
  ('public.text_has_swearing(text)', 'members only', true, false),
  ('public.review_insert_allowed(uuid,uuid)', 'members only', true, false),
  ('public.can_reply_to_review(uuid)', 'members only', true, false),
  ('public.get_member_reviews(uuid,text,text,text,integer,integer)', 'members only', true, false),
  ('public.get_member_review_summary(uuid,text)', 'members only', true, false),
  ('public.get_my_waiting_reviews()', 'members only', true, false),
  ('public.get_my_review_status(uuid)', 'members only', true, false),
  ('public.profile_visible_to_me(uuid)', 'members only', true, false),
  ('public.get_city_chat_senders(uuid,uuid[])', 'members only', true, false),
  ('public.admin_list_reports()', 'members (admins only inside)', true, false),
  ('public.admin_get_report_chat(uuid)', 'members (admins only inside)', true, false)
) AS f(sig, expect, member_ok, anon_ok)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT 'profiles: no read-everything policy', '0 permissive SELECT policies with USING (true)',
       COALESCE((SELECT string_agg(policyname, ', ') FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd IN ('SELECT', 'ALL') AND permissive = 'PERMISSIVE'
                   AND btrim(COALESCE(qual, '')) IN ('true', '(true)')), 'none'),
       NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd IN ('SELECT', 'ALL') AND permissive = 'PERMISSIVE'
                     AND btrim(COALESCE(qual, '')) IN ('true', '(true)'))

UNION ALL
SELECT 'profiles: members see only what they may', 'policy uses profile_visible_to_me(id)',
       COALESCE((SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
                 AND policyname = 'Members see profiles they may see'), 'missing'),
       COALESCE((SELECT qual ~ 'profile_visible_to_me\(id\)' FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
                 AND policyname = 'Members see profiles they may see'), false)

UNION ALL
SELECT 'profiles: column grants unchanged (no email or phone for members)', 'members can''t read email, phone_number or last_name',
       'email ' || has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT')::text
         || ', phone ' || has_column_privilege('authenticated', 'public.profiles', 'phone_number', 'SELECT')::text,
       NOT has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT')
         AND NOT has_column_privilege('authenticated', 'public.profiles', 'phone_number', 'SELECT')

UNION ALL
SELECT format('reviews policy "%s"', x.name), x.expect,
       COALESCE((SELECT COALESCE(qual, with_check) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews' AND policyname = x.name), 'missing'),
       COALESCE((SELECT COALESCE(qual, with_check) ~ x.pattern FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews' AND policyname = x.name), false)
FROM (VALUES
  ('Admins can view all reviews', 'admins', 'is_admin_user'),
  ('Writers see their own reviews', 'the writer', 'reviewer_user_id = auth\.uid\(\)'),
  ('Reviewees see published reviews about them', 'the reviewee, published only', 'published_at IS NOT NULL'),
  ('Sit members can write one review', 'row columns passed, no lookup by id', 'review_insert_allowed\(sit_id, reviewee_user_id\)')
) AS x(name, expect, pattern)

UNION ALL
SELECT 'reviews: only those four policies', '4 policies, none for visitors',
       (SELECT count(*)::text || ' (' || string_agg(policyname, ', ') || ')' FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews'),
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews') = 4
         AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews' AND roles @> ARRAY['anon']::name[])

UNION ALL
SELECT 'reviews: visitors read nothing directly', 'anon has no SELECT on reviews (table or column)',
       'table ' || has_table_privilege('anon', 'public.reviews', 'SELECT')::text || ', any column ' || has_any_column_privilege('anon', 'public.reviews', 'SELECT')::text,
       NOT has_table_privilege('anon', 'public.reviews', 'SELECT') AND NOT has_any_column_privilege('anon', 'public.reviews', 'SELECT')

UNION ALL
SELECT 'reviews: one per sit per writer', 'unique index reviews_one_per_sit_writer',
       COALESCE((SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'reviews_one_per_sit_writer'), 'missing'),
       EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
               WHERE c.relname = 'reviews_one_per_sit_writer' AND i.indisunique)

UNION ALL
SELECT format('reviews column %s', x.col), x.expect,
       COALESCE((SELECT format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' not null' ELSE '' END
                 FROM pg_attribute a WHERE a.attrelid = 'public.reviews'::regclass AND a.attname = x.col AND NOT a.attisdropped), 'missing'),
       EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = 'public.reviews'::regclass AND a.attname = x.col AND NOT a.attisdropped
               AND format_type(a.atttypid, a.atttypmod) = x.typ)
FROM (VALUES
  ('would_again', 'boolean, may be empty', 'boolean'),
  ('highlights', 'text[], up to 3 fixed keys', 'text[]'),
  ('published_at', 'timestamptz, empty until both reviewed or the window closed', 'timestamp with time zone')
) AS x(col, expect, typ)

UNION ALL
SELECT 'reviews: picks are fixed keys, up to 3', 'check constraint reviews_highlights_check',
       COALESCE((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'reviews_highlights_check'), 'missing'),
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_highlights_check' AND pg_get_constraintdef(oid) ~ 'cardinality')

UNION ALL
SELECT 'reviews that were already on the site stay visible', '0 reviews older than this migration still unpublished',
       (SELECT count(*)::text FROM public.reviews WHERE published_at IS NULL
          AND created_at < (SELECT min(created_at) FROM public.blocked_terms)),
       NOT EXISTS (SELECT 1 FROM public.reviews WHERE published_at IS NULL
                   AND created_at < (SELECT min(created_at) FROM public.blocked_terms))

UNION ALL
SELECT 'review_replies: one per review', 'unique review_id',
       COALESCE((SELECT string_agg(indexdef, '; ') FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'review_replies' AND indexdef ~ 'UNIQUE.*review_id'), 'missing'),
       EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'review_replies' AND indexdef ~ 'UNIQUE.*review_id')

UNION ALL
SELECT 'report type review exists', 'report_target_type has review',
       (SELECT string_agg(enumlabel, ', ' ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid = 'public.report_target_type'::regtype),
       EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.report_target_type'::regtype AND enumlabel = 'review')

UNION ALL
SELECT 'reports can carry the chat', 'reports.conversation_id',
       CASE WHEN EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.reports'::regclass AND attname = 'conversation_id' AND NOT attisdropped)
            THEN 'present' ELSE 'missing' END,
       EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.reports'::regclass AND attname = 'conversation_id' AND NOT attisdropped)

UNION ALL
SELECT format('restrictive policy "%s" on %s', x.name, x.tbl), 'restrictive, uses a block helper',
       COALESCE((SELECT permissive || ': ' || COALESCE(qual, with_check) FROM pg_policies WHERE schemaname = 'public' AND tablename = x.tbl AND policyname = x.name), 'missing'),
       COALESCE((SELECT permissive = 'RESTRICTIVE' AND COALESCE(qual, with_check) ~ '(hidden_by_block|is_blocked_with|conversation_open_to_me|listing_owner_blocked_with_me)'
                 FROM pg_policies WHERE schemaname = 'public' AND tablename = x.tbl AND policyname = x.name), false)
FROM (VALUES
  ('messages', 'No messages across a block'),
  ('conversations', 'No new conversations across a block'),
  ('applications', 'No applications across a block'),
  ('sitter_invites', 'No invitations across a block'),
  ('listings', 'Listings hidden across a block'),
  ('sitter_profiles', 'Nomad profiles hidden across a block'),
  ('owner_profiles', 'Pet Parent profiles hidden across a block'),
  ('city_chat_messages', 'City Chat messages hidden across a block')
) AS x(tbl, name)

UNION ALL
SELECT format('trigger %s on %s', x.trg, x.tbl), 'enabled',
       COALESCE((SELECT CASE tg.tgenabled WHEN 'O' THEN 'enabled' ELSE 'state ' || tg.tgenabled::text END
                 FROM pg_trigger tg WHERE tg.tgrelid = to_regclass('public.' || x.tbl) AND tg.tgname = x.trg), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = to_regclass('public.' || x.tbl) AND tg.tgname = x.trg AND tg.tgenabled = 'O')
FROM (VALUES
  ('word_filter', 'reviews'), ('word_filter', 'review_replies'), ('word_filter', 'profiles'), ('word_filter', 'sitter_profiles'),
  ('word_filter', 'owner_profiles'), ('word_filter', 'listings'), ('word_filter', 'sit_stories'), ('word_filter', 'city_chat_messages'),
  ('word_filter', 'messages'), ('word_filter', 'review_flag_evidence'), ('word_filter', 'community_flags'),
  ('cancel_sits_on_block', 'member_blocks'), ('refuse_sit_across_block', 'sits'), ('review_before_insert', 'reviews'),
  ('notify_review_received', 'reviews'), ('notify_review_reply', 'review_replies'), ('guard_report_insert', 'reports'),
  ('blocked_terms_normalize', 'blocked_terms')
) AS x(trg, tbl)

UNION ALL
SELECT 'word filter levels', 'messages, flag notes: banned only; the rest: public',
       (SELECT string_agg(c.relname || '=' || encode(tg.tgargs, 'escape'), '; ' ORDER BY c.relname)
        FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid WHERE tg.tgname = 'word_filter'),
       NOT EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
                   WHERE tg.tgname = 'word_filter'
                     AND (c.relname IN ('messages', 'review_flag_evidence', 'community_flags')) <> (split_part(encode(tg.tgargs, 'escape'), '\000', 1) = 'private'))

UNION ALL
SELECT 'word filter starter list', 'both levels seeded',
       (SELECT string_agg(level || ' ' || n, ', ') FROM (SELECT level, count(*) AS n FROM public.blocked_terms GROUP BY level) x),
       (SELECT count(DISTINCT level) FROM public.blocked_terms) = 2 AND (SELECT count(*) FROM public.blocked_terms) >= 40

UNION ALL
SELECT format('word filter: "%s"', x.sample), COALESCE(x.expect, 'allowed'),
       COALESCE(public.text_violation(x.sample), 'allowed'),
       public.text_violation(x.sample) IS NOT DISTINCT FROM x.expect
FROM (VALUES
  ('Scunthorpe', NULL), ('a first class sit', NULL), ('we assess every home', NULL),
  ('This is shit', 'swear'), ('fucking annoying', 'swear'), ('I''ll kill you', 'banned')
) AS x(sample, expect)

UNION ALL
SELECT 'AI summary flag', 'review_summary_enabled exists (off by default)',
       COALESCE((SELECT value::text FROM public.app_settings WHERE key = 'review_summary_enabled'), 'missing'),
       EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'review_summary_enabled')

UNION ALL
SELECT 'get_conversation_partners has the block flags', 'i_blocked and chat_closed columns',
       COALESCE((SELECT pg_get_function_result(oid) FROM pg_proc WHERE oid = to_regprocedure('public.get_conversation_partners()')), 'missing'),
       COALESCE((SELECT pg_get_function_result(oid) ~ 'i_blocked' AND pg_get_function_result(oid) ~ 'chat_closed'
                 FROM pg_proc WHERE oid = to_regprocedure('public.get_conversation_partners()')), false)

UNION ALL
SELECT format('%s knows about blocks', f.sig), 'mentions blocked_between',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc ~ 'blocked_between')::text END,
       p.oid IS NOT NULL AND p.prosrc ~ 'blocked_between'
FROM (VALUES ('public.application_is_live(application_status,uuid,uuid)'), ('public.invitation_is_live(text,uuid,uuid)'),
             ('public.get_listing_applicants(uuid)'), ('public.require_owner_access_to_invite()')) AS f(sig)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT 'applicants list uses the one rating', 'get_listing_applicants reads member_ratings',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc ~ 'member_ratings')::text END,
       p.oid IS NOT NULL AND p.prosrc ~ 'member_ratings'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.get_listing_applicants(uuid)')

UNION ALL
SELECT 'review notification never carries the rating or text', 'notify_review_received sends no rating or text',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc !~ '''rating''' AND p.prosrc !~ '''text''')::text END,
       p.oid IS NOT NULL AND p.prosrc !~ '''rating''' AND p.prosrc !~ '''text'''
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.notify_review_received()')
;
