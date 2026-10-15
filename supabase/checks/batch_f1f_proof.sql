-- Batch F1f: proof that the live database matches 20261015090000_batch_f1f.sql.
-- READ-ONLY. One row per check; every row should have ok = true.

SELECT 'policy "Users can upload own ID documents"' AS item,
       'INSERT, authenticated: ID bucket, own folder, and an allowed extension' AS expected,
       COALESCE((SELECT format('%s, %s, %s', cmd, roles::text, with_check) FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can upload own ID documents'), 'missing') AS actual,
       EXISTS (SELECT 1 FROM pg_policies p
               WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = 'Users can upload own ID documents'
                 AND p.cmd = 'INSERT' AND p.permissive = 'PERMISSIVE' AND p.roles = ARRAY['authenticated']::name[]
                 AND position('bucket_id = ''id-verification-documents''' IN p.with_check) > 0
                 AND position('(storage.foldername(name))[1] = (auth.uid())::text' IN p.with_check) > 0
                 AND position('lower(storage.extension(name))' IN p.with_check) > 0
                 AND (SELECT bool_and(position(quote_literal(e) IN p.with_check) > 0)
                      FROM unnest(ARRAY['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf']) e)
                 -- nothing else, such as svg or html
                 AND p.with_check !~* '''(svg|html?|xml|js|gif)''') AS ok

UNION ALL
SELECT 'the other ID bucket policies are unchanged', 'read own, admins read all, delete own unused drafts; no UPDATE',
       COALESCE((SELECT string_agg(cmd || ' ' || policyname, '; ' ORDER BY cmd, policyname) FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND position('id-verification-documents' IN COALESCE(qual, '') || COALESCE(with_check, '')) > 0), 'none'),
       (SELECT array_agg(cmd || ' ' || policyname ORDER BY cmd, policyname) FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND position('id-verification-documents' IN COALESCE(qual, '') || COALESCE(with_check, '')) > 0)
       = ARRAY['DELETE Members can delete own unused ID drafts', 'INSERT Users can upload own ID documents',
               'SELECT Admins can read all ID documents', 'SELECT Users can read own ID documents']

UNION ALL
-- Lovable can't set the bucket's file types, so the limit may
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

ORDER BY ok, item;
