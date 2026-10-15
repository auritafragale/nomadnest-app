-- Batch F1f: ID uploads are limited by file type through the upload rule.
--
-- Lovable can't set allowed_mime_types on the id-verification-documents
-- bucket, so the INSERT policy on storage.objects now also requires one of
-- the extensions the app uploads (lower case): jpg, jpeg, png, webp, heic,
-- heif, pdf. The bucket and own-folder checks are exactly as on live.
-- It is the only policy that lets members add files to this bucket (the
-- other INSERT policies are for other buckets, or RESTRICTIVE). No other
-- policy changes, and nothing is written to storage.buckets.

DROP POLICY IF EXISTS "Users can upload own ID documents" ON storage.objects;
CREATE POLICY "Users can upload own ID documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'id-verification-documents'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf')
  );
