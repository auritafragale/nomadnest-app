-- Batch F1f: leftover check. Run after batch_f1f_member_test.sql. READ-ONLY.
-- The count must be 0: the member test always rolls back.

SELECT count(*) AS test_storage_rows
FROM storage.objects
WHERE bucket_id = 'id-verification-documents' AND name LIKE '%/draft/f1f-%';
