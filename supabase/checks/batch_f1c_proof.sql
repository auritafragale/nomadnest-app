-- Batch F1c: proof that the live database matches
-- 20261014180000_batch_f1c.sql (or Lovable's copy of it), plus the ID bucket
-- settings Lovable sets through its Storage step.
-- READ-ONLY. One row per check; every row should have ok = true.
-- pg_trigger.tgtype bits: 1 row, 2 before, 4 insert, 8 delete, 16 update.

SELECT 'trigger notify_invite_answered' AS item, 'enabled, AFTER UPDATE, row, only when status becomes declined' AS expected,
       COALESCE((SELECT format('enabled %s, before %s, update %s, row %s, when %s', tg.tgenabled, (tg.tgtype & 2 = 2)::text,
                               (tg.tgtype & 16 = 16)::text, (tg.tgtype & 1 = 1)::text, pg_get_triggerdef(tg.oid) ~ 'declined')
                 FROM pg_trigger tg WHERE tg.tgrelid = 'public.sitter_invites'::regclass AND tg.tgname = 'notify_invite_answered'), 'missing') AS actual,
       EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
               WHERE tg.tgrelid = 'public.sitter_invites'::regclass AND tg.tgname = 'notify_invite_answered'
                 AND tg.tgenabled = 'O' AND tg.tgtype & 2 = 0 AND tg.tgtype & 1 = 1 AND tg.tgtype & 16 = 16 AND tg.tgtype & 4 = 0
                 AND pg_get_triggerdef(tg.oid) ~ 'WHEN .*declined' AND p.proname = 'notify_invite_answered') AS ok

UNION ALL
SELECT format('guard trigger %s on %s', t.trg, t.tbl), t.expect,
       COALESCE((SELECT format('enabled %s, before %s, row %s, insert %s, update %s, runs %s', tg.tgenabled, (tg.tgtype & 2 = 2)::text,
                               (tg.tgtype & 1 = 1)::text, (tg.tgtype & 4 = 4)::text, (tg.tgtype & 16 = 16)::text, p.proname)
                 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
                 WHERE tg.tgrelid = to_regclass('public.' || t.tbl) AND tg.tgname = t.trg), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
               WHERE tg.tgrelid = to_regclass('public.' || t.tbl) AND tg.tgname = t.trg AND tg.tgenabled = 'O'
                 AND tg.tgtype & 2 = 2 AND tg.tgtype & 1 = 1 AND tg.tgtype & 16 = 16
                 AND (tg.tgtype & 4 = 4) = t.on_insert AND p.proname = t.trg)
FROM (VALUES
  ('guard_sitter_invite_update', 'sitter_invites', false, 'enabled, BEFORE UPDATE, row'),
  ('guard_manual_id_verification', 'manual_id_verifications', true, 'enabled, BEFORE INSERT OR UPDATE, row')
) AS t(trg, tbl, on_insert, expect)

UNION ALL
SELECT 'one live invitation per range and Nomad', 'unique index on (sit_dates_id, sitter_user_id) where pending or viewed',
       COALESCE((SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'sitter_invites_one_live_per_range'), 'missing'),
       EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
               WHERE c.relname = 'sitter_invites_one_live_per_range' AND i.indisunique AND i.indisvalid
                 AND pg_get_indexdef(i.indexrelid) ~ 'sit_dates_id, sitter_user_id'
                 AND pg_get_expr(i.indpred, i.indrelid) ~ 'pending' AND pg_get_expr(i.indpred, i.indrelid) ~ 'viewed'
                 AND pg_get_expr(i.indpred, i.indrelid) !~ 'applied|declined')

UNION ALL
SELECT 'old policy "Sitters can update received invites" removed', 'absent',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sitter_invites'
                         AND policyname = 'Sitters can update received invites') THEN 'present' ELSE 'absent' END,
       NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sitter_invites'
                   AND policyname = 'Sitters can update received invites')

UNION ALL
SELECT 'policy "Sitters can answer received invites"', 'UPDATE, authenticated, own invitations (using and check)',
       COALESCE((SELECT format('%s, %s, using %s, check %s', cmd, roles::text, qual, with_check) FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'sitter_invites' AND policyname = 'Sitters can answer received invites'), 'missing'),
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sitter_invites'
                 AND policyname = 'Sitters can answer received invites' AND cmd = 'UPDATE' AND roles = ARRAY['authenticated']::name[]
                 AND qual ~ 'auth\.uid\(\) = sitter_user_id' AND with_check ~ 'auth\.uid\(\) = sitter_user_id')
       -- and it's the only UPDATE policy members have on invitations
       AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sitter_invites' AND cmd IN ('UPDATE', 'ALL')) = 1

UNION ALL
SELECT 'storage policy "Members can delete own unused ID drafts"', 'DELETE, authenticated, own draft folder, unused only',
       COALESCE((SELECT format('%s, %s, %s', cmd, roles::text, qual) FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Members can delete own unused ID drafts'), 'missing'),
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND policyname = 'Members can delete own unused ID drafts' AND cmd = 'DELETE' AND roles = ARRAY['authenticated']::name[]
                 AND qual ~ 'id-verification-documents' AND qual ~ 'draft' AND qual ~ 'auth\.uid\(\)' AND qual ~ 'id_document_in_use')
       -- and no other policy lets members delete from this bucket
       AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('DELETE', 'ALL')
                         AND policyname <> 'Members can delete own unused ID drafts' AND COALESCE(qual, '') ~ 'id-verification-documents'
                         AND COALESCE(qual, '') !~ 'is_admin_user')

UNION ALL
SELECT 'bucket id-verification-documents: size limit', '10MB (10485760 bytes), private',
       COALESCE((SELECT format('%s bytes, public %s', COALESCE(file_size_limit::text, 'no limit'), public) FROM storage.buckets
                 WHERE id = 'id-verification-documents'), 'missing'),
       EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'id-verification-documents' AND file_size_limit = 10485760 AND NOT public)

UNION ALL
-- Updated for F1f: Lovable can't set the bucket's file types, so the limit may
-- instead be the upload rule (allowed_mime_types null and the INSERT policy
-- requiring jpg, jpeg, png, webp, heic, heif or pdf). "actual" says which way
-- it passed.
SELECT 'bucket id-verification-documents: file types limited', 'by the bucket''s file types, or by the upload rule',
       COALESCE(t.way, 'not limited: ' || COALESCE((SELECT array_to_string(allowed_mime_types, ', ') FROM storage.buckets
                                                    WHERE id = 'id-verification-documents'), 'any type, and no extension rule')),
       t.way IS NOT NULL
FROM (
  SELECT (SELECT CASE
            WHEN b.allowed_mime_types IS NOT NULL
                 AND (SELECT array_agg(x ORDER BY x) FROM unnest(b.allowed_mime_types) x)
                     = ARRAY['application/pdf', 'image/heic', 'image/heif', 'image/jpeg', 'image/png', 'image/webp']
              THEN 'by the bucket''s file types'
            WHEN b.allowed_mime_types IS NULL
                 AND EXISTS (SELECT 1 FROM pg_policies p
                             WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd = 'INSERT'
                               AND p.policyname = 'Users can upload own ID documents'
                               AND position('id-verification-documents' IN p.with_check) > 0
                               AND position('foldername(name)' IN p.with_check) > 0
                               AND position('lower(storage.extension(name))' IN p.with_check) > 0
                               AND (SELECT bool_and(position(quote_literal(e) IN p.with_check) > 0)
                                    FROM unnest(ARRAY['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf']) e))
                 -- and no other permissive policy lets members add files to this bucket
                 AND NOT EXISTS (SELECT 1 FROM pg_policies p
                                 WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd IN ('INSERT', 'ALL')
                                   AND p.permissive = 'PERMISSIVE' AND p.policyname <> 'Users can upload own ID documents'
                                   AND (position('id-verification-documents' IN COALESCE(p.with_check, p.qual, '')) > 0
                                        OR position('bucket_id = ''' IN COALESCE(p.with_check, p.qual, '')) = 0))
              THEN 'by the upload rule (file extensions)'
          END
          FROM storage.buckets b WHERE b.id = 'id-verification-documents') AS way
) t

UNION ALL
SELECT format('notification_category(%L)', x.t), 'applications',
       COALESCE(public.notification_category(x.t), 'null'),
       public.notification_category(x.t) = 'applications'
FROM (VALUES ('invite_declined'), ('invite'), ('new_application'), ('application_withdrawn')) AS x(t)

UNION ALL
SELECT format('function %s', f.sig), f.expect,
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'definer ' || p.prosecdef::text || ', ' || COALESCE(array_to_string(p.proconfig, ','), 'no config')
                 || ', member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 || ', visitor ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
                 || ', service ' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text END,
       p.oid IS NOT NULL AND p.prosecdef
         AND COALESCE(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE') = f.member
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
         AND (NOT f.service OR has_function_privilege('service_role', p.oid, 'EXECUTE'))
FROM (VALUES
  ('public.notify_invite_answered()', false, false, 'definer, search_path=public, no member or visitor access'),
  ('public.guard_sitter_invite_update()', false, false, 'definer, search_path=public, no member or visitor access'),
  ('public.guard_manual_id_verification()', false, false, 'definer, search_path=public, no member or visitor access'),
  ('public.id_document_in_use(text)', true, false, 'definer, search_path=public, members yes (storage policy), visitors no'),
  ('public.expired_id_drafts()', false, true, 'definer, search_path=public, retention job only')
) AS f(sig, member, service, expect)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT 'no member text: declined invitation', 'notify_invite_answered never uses the invitation message',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (NOT (p.prosrc ~ '\.message'))::text END,
       p.oid IS NOT NULL AND NOT (p.prosrc ~ '\.message')
FROM (SELECT to_regprocedure('public.notify_invite_answered()') AS oid) x
LEFT JOIN pg_proc p ON p.oid = x.oid

UNION ALL
SELECT 'the guards check the right things', 'invites: applied needs an application; ID checks: pending and own folder',
       CASE WHEN a.oid IS NULL OR b.oid IS NULL THEN 'missing'
            ELSE format('invite guard %s, id guard %s',
                        (a.prosrc ~ 'public\.applications' AND a.prosrc ~ 'request_is_end_user')::text,
                        (b.prosrc ~ '''pending''' AND b.prosrc ~ 'v_prefix' AND b.prosrc ~ 'is_admin_user')::text) END,
       a.oid IS NOT NULL AND b.oid IS NOT NULL
         AND a.prosrc ~ 'public\.applications' AND a.prosrc ~ 'request_is_end_user'
         AND b.prosrc ~ '''pending''' AND b.prosrc ~ 'v_prefix' AND b.prosrc ~ 'is_admin_user'
FROM (SELECT 1) one
LEFT JOIN pg_proc a ON a.oid = to_regprocedure('public.guard_sitter_invite_update()')
LEFT JOIN pg_proc b ON b.oid = to_regprocedure('public.guard_manual_id_verification()');
