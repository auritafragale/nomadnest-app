-- Batch P2: leftover check. Run after batch_p2_member_test.sql. READ-ONLY.
-- Every count must be 0: the member test always rolls back.

SELECT
  (SELECT count(*) FROM public.perks WHERE slug = 'p2-test-perk' OR short_title = '{country} test plan') AS test_perks,
  (SELECT count(*) FROM public.perk_clicks c WHERE NOT EXISTS (SELECT 1 FROM public.perks p WHERE p.id = c.perk_id)) AS orphan_clicks,
  (SELECT count(*) FROM storage.objects WHERE name LIKE 'p2-test-%') AS test_storage_rows;
