-- Dashboard summary and Sit Stories list, report evidence, Welcome Guide
-- photo paths, and conversation ordering.
--
-- 1. get_my_dashboard_summary(): the caller's current and next sits, new
--    applicants, pending invites and reviews due (own data only).
-- 2. get_my_sit_stories(): the caller's Sit Stories with portfolio status.
-- 3. Report evidence: members insert reports through a column grant (never
--    status or evidence_paths), attach files with attach_report_evidence(),
--    and past reports get their already-uploaded files back (backfill).
-- 4. welcome_guide_photos: a new row must point at a real file in the
--    owner's own {owner_id}/{listing_id}/ folder, named as the app names it.
-- 5. conversations.updated_at follows the latest message (trigger), so the
--    app no longer needs to (and can't) update it.


-- ─── 1. Dashboard summary ───────────────────────────────────────────────────
-- "Today" is the home's local day (sit_update_due), like the chat pill.

CREATE OR REPLACE FUNCTION public.get_my_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'current_sits', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'sit_id', x.id,
               'role', x.role,
               'listing_id', x.listing_id,
               'listing_title', x.listing_title,
               'city', x.city,
               'other_first_name', x.other_first_name,
               'start_date', x.start_date,
               'end_date', x.end_date,
               'day_number', x.today - x.start_date + 1,
               'total_days', x.end_date - x.start_date + 1,
               'due_today', COALESCE((x.due->>'due_today')::boolean, false),
               'sent_today', COALESCE((x.due->>'sent_today')::boolean, false)
             ) ORDER BY x.start_date)
      FROM (
        SELECT s.id, s.listing_id,
               CASE WHEN s.sitter_user_id = v_uid THEN 'sitter' ELSE 'owner' END AS role,
               COALESCE(l.title, s.snapshot_title, 'your sit') AS listing_title,
               COALESCE(l.city, s.snapshot_city) AS city,
               COALESCE(NULLIF(TRIM(op.first_name), ''), 'Former member') AS other_first_name,
               COALESCE(sd.start_date, s.snapshot_start_date) AS start_date,
               COALESCE(sd.end_date, s.snapshot_end_date) AS end_date,
               due.d AS due,
               (due.d->>'today')::date AS today
        FROM public.sits s
        LEFT JOIN public.listings l ON l.id = s.listing_id
        LEFT JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
        LEFT JOIN public.profiles op
          ON op.id = CASE WHEN s.sitter_user_id = v_uid THEN s.owner_user_id ELSE s.sitter_user_id END
        CROSS JOIN LATERAL (SELECT public.sit_update_due(s.id) AS d) due
        WHERE v_uid IN (s.owner_user_id, s.sitter_user_id)
          AND s.status IN ('confirmed', 'in_progress')
      ) x
      WHERE x.today BETWEEN x.start_date AND x.end_date
    ), '[]'::jsonb),

    'next_sits', COALESCE((
      SELECT jsonb_agg(y.obj ORDER BY y.start_date)
      FROM (
        SELECT jsonb_build_object(
                 'sit_id', s.id,
                 'role', CASE WHEN s.sitter_user_id = v_uid THEN 'sitter' ELSE 'owner' END,
                 'listing_id', s.listing_id,
                 'listing_title', COALESCE(l.title, s.snapshot_title, 'your sit'),
                 'city', COALESCE(l.city, s.snapshot_city),
                 'other_first_name', COALESCE(NULLIF(TRIM(op.first_name), ''), 'Former member'),
                 'start_date', COALESCE(sd.start_date, s.snapshot_start_date),
                 'end_date', COALESCE(sd.end_date, s.snapshot_end_date)
               ) AS obj,
               COALESCE(sd.start_date, s.snapshot_start_date) AS start_date
        FROM public.sits s
        LEFT JOIN public.listings l ON l.id = s.listing_id
        LEFT JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
        LEFT JOIN public.profiles op
          ON op.id = CASE WHEN s.sitter_user_id = v_uid THEN s.owner_user_id ELSE s.sitter_user_id END
        WHERE v_uid IN (s.owner_user_id, s.sitter_user_id)
          AND s.status = 'confirmed'
          AND COALESCE(sd.start_date, s.snapshot_start_date) > current_date
        ORDER BY COALESCE(sd.start_date, s.snapshot_start_date)
        LIMIT 5
      ) y
    ), '[]'::jsonb),

    'new_applicants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('listing_id', l.id, 'listing_title', l.title, 'count', c.n)
                       ORDER BY l.created_at)
      FROM public.listings l
      CROSS JOIN LATERAL (
        SELECT count(*) AS n FROM public.applications a
        WHERE a.listing_id = l.id AND a.status = 'applied'
      ) c
      WHERE l.owner_user_id = v_uid AND c.n > 0
    ), '[]'::jsonb),

    'pending_invites', (
      SELECT count(*) FROM public.sitter_invites i
      WHERE i.sitter_user_id = v_uid AND i.status = 'pending'
    ),

    -- Reviews stay open for 14 days after the sit ended (or was cut short).
    'reviews_due', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'sit_id', s.id,
               'role', CASE WHEN s.sitter_user_id = v_uid THEN 'sitter' ELSE 'owner' END,
               'listing_title', COALESCE(l.title, s.snapshot_title, 'your sit'),
               'other_first_name', COALESCE(NULLIF(TRIM(op.first_name), ''), 'your match'),
               'days_left', 14 - (current_date - r.anchor)
             ) ORDER BY r.anchor)
      FROM public.sits s
      LEFT JOIN public.listings l ON l.id = s.listing_id
      LEFT JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
      LEFT JOIN public.profiles op
        ON op.id = CASE WHEN s.sitter_user_id = v_uid THEN s.owner_user_id ELSE s.sitter_user_id END
      CROSS JOIN LATERAL (
        SELECT CASE WHEN s.status = 'cancelled' THEN s.cancelled_at::date
                    ELSE COALESCE(sd.end_date, s.snapshot_end_date) END AS anchor
      ) r
      WHERE v_uid IN (s.owner_user_id, s.sitter_user_id)
        AND s.owner_user_id IS NOT NULL AND s.sitter_user_id IS NOT NULL
        AND (s.status = 'completed' OR (s.status = 'cancelled' AND s.cancelled_from_status = 'in_progress'))
        AND r.anchor IS NOT NULL
        AND current_date - r.anchor BETWEEN 0 AND 13
        AND NOT EXISTS (SELECT 1 FROM public.reviews rv WHERE rv.sit_id = s.id AND rv.reviewer_user_id = v_uid)
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_dashboard_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dashboard_summary() TO authenticated;


-- ─── 2. Sit Stories on the dashboard ────────────────────────────────────────
-- Ready stories, plus ones still being written, for sits the caller was part
-- of. Same visibility as the sit_stories read policy (owner or sitter).

CREATE OR REPLACE FUNCTION public.get_my_sit_stories()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', st.id,
             'sit_id', st.sit_id,
             'role', CASE WHEN st.sitter_user_id = v_uid THEN 'sitter' ELSE 'owner' END,
             'status', st.status,
             'title', CASE WHEN st.status = 'ready' THEN st.title END,
             'excerpt', CASE WHEN st.status = 'ready' THEN left(regexp_replace(COALESCE(st.story, ''), '\s+', ' ', 'g'), 180) END,
             'photo_path', CASE WHEN st.status = 'ready' THEN st.photo_paths[1] END,
             'listing_title', COALESCE(l.title, s.snapshot_title),
             'city', COALESCE(l.city, s.snapshot_city),
             'other_first_name', COALESCE(NULLIF(TRIM(op.first_name), ''), 'Former member'),
             'portfolio_status', st.portfolio_status,
             'ready_at', st.ready_at
           ) ORDER BY COALESCE(st.ready_at, st.created_at) DESC)
    FROM public.sit_stories st
    JOIN public.sits s ON s.id = st.sit_id
    LEFT JOIN public.listings l ON l.id = s.listing_id
    LEFT JOIN public.profiles op
      ON op.id = CASE WHEN st.sitter_user_id = v_uid THEN st.owner_user_id ELSE st.sitter_user_id END
    WHERE v_uid IN (st.owner_user_id, st.sitter_user_id)
      AND st.status IN ('ready', 'queued', 'generating')
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_sit_stories() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_sit_stories() TO authenticated;


-- ─── 3. Report evidence ─────────────────────────────────────────────────────

-- Members insert only these columns; status and evidence_paths are never
-- theirs to set. No member UPDATE (admins use admin_set_report_status).
REVOKE INSERT, UPDATE ON public.reports FROM PUBLIC, anon, authenticated;
GRANT INSERT (reporter_user_id, target_type, target_id, reason, details) ON public.reports TO authenticated;

-- The reporter attaches files already uploaded to their own folder for this
-- report ({reporter}/{report}/{file}), only while the report is pending.
CREATE OR REPLACE FUNCTION public.attach_report_evidence(p_report_id uuid, p_paths text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_report public.reports%ROWTYPE;
  v_path text;
  v_result text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF v_report.id IS NULL OR v_report.reporter_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Report not found.' USING ERRCODE = '42501';
  END IF;
  IF v_report.status <> 'pending' THEN
    RAISE EXCEPTION 'This report is closed.' USING ERRCODE = '42501';
  END IF;
  IF p_paths IS NULL OR cardinality(p_paths) = 0 OR cardinality(p_paths) > 10 THEN
    RAISE EXCEPTION 'Attach between 1 and 10 files.';
  END IF;

  FOREACH v_path IN ARRAY p_paths LOOP
    IF v_path !~ ('^' || v_uid::text || '/' || p_report_id::text || '/[0-9a-f-]{36}(\.[A-Za-z0-9]{1,10})?$') THEN
      RAISE EXCEPTION 'Invalid file.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'report-evidence' AND o.name = v_path AND o.owner_id = v_uid::text
    ) THEN
      RAISE EXCEPTION 'A file is missing. Please attach it again.';
    END IF;
  END LOOP;

  SELECT array_agg(DISTINCT p ORDER BY p) INTO v_result
  FROM unnest(COALESCE(v_report.evidence_paths, '{}') || p_paths) AS p;

  IF cardinality(v_result) > 10 THEN
    RAISE EXCEPTION 'Attach up to 10 files.';
  END IF;

  UPDATE public.reports SET evidence_paths = v_result WHERE id = p_report_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_report_evidence(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_report_evidence(uuid, text[]) TO authenticated;

-- Backfill: files members uploaded for past reports, which were never
-- recorded (the old app update was silently refused).
UPDATE public.reports r
SET evidence_paths = f.paths
FROM (
  SELECT r2.id, array_agg(o.name ORDER BY o.created_at, o.name) AS paths
  FROM public.reports r2
  JOIN storage.objects o
    ON o.bucket_id = 'report-evidence'
   AND r2.reporter_user_id IS NOT NULL
   AND o.name LIKE r2.reporter_user_id::text || '/' || r2.id::text || '/%'
  WHERE cardinality(COALESCE(r2.evidence_paths, '{}')) = 0
  GROUP BY r2.id
) f
WHERE r.id = f.id;


-- ─── 4. welcome_guide_photos: strict paths on insert ────────────────────────
-- The single FOR ALL policy is split so the strict rule applies to new rows:
-- {owner_id}/{listing_id}/{uuid}.jpg|jpeg|png|webp, and the file must exist
-- in the bucket, uploaded by the caller. Reading, caption edits and deletes
-- keep the existing ownership rule (storage_path can't be updated at all).

CREATE OR REPLACE FUNCTION public.guide_photo_object_ok(p_listing_id uuid, p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_path ~ ('^' || auth.uid()::text || '/' || p_listing_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
    AND EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'welcome-guide-photos' AND o.name = p_path AND o.owner_id = auth.uid()::text
    );
$$;

REVOKE ALL ON FUNCTION public.guide_photo_object_ok(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guide_photo_object_ok(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "Owners manage their guide photos" ON public.welcome_guide_photos;
DROP POLICY IF EXISTS "Owners read their guide photo rows" ON public.welcome_guide_photos;
DROP POLICY IF EXISTS "Owners add guide photos" ON public.welcome_guide_photos;
DROP POLICY IF EXISTS "Owners edit their guide photo rows" ON public.welcome_guide_photos;
DROP POLICY IF EXISTS "Owners delete their guide photo rows" ON public.welcome_guide_photos;

CREATE POLICY "Owners read their guide photo rows"
ON public.welcome_guide_photos FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = welcome_guide_photos.listing_id AND l.owner_user_id = auth.uid()));

CREATE POLICY "Owners add guide photos"
ON public.welcome_guide_photos FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.listings l WHERE l.id = welcome_guide_photos.listing_id AND l.owner_user_id = auth.uid())
  AND public.guide_photo_object_ok(listing_id, storage_path)
  AND (pet_id IS NULL OR EXISTS (SELECT 1 FROM public.pets p WHERE p.id = welcome_guide_photos.pet_id AND p.listing_id = welcome_guide_photos.listing_id))
);

CREATE POLICY "Owners edit their guide photo rows"
ON public.welcome_guide_photos FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = welcome_guide_photos.listing_id AND l.owner_user_id = auth.uid()))
WITH CHECK (
  EXISTS (SELECT 1 FROM public.listings l WHERE l.id = welcome_guide_photos.listing_id AND l.owner_user_id = auth.uid())
  AND storage_path LIKE auth.uid()::text || '/' || listing_id::text || '/%'
  AND (pet_id IS NULL OR EXISTS (SELECT 1 FROM public.pets p WHERE p.id = welcome_guide_photos.pet_id AND p.listing_id = welcome_guide_photos.listing_id))
);

CREATE POLICY "Owners delete their guide photo rows"
ON public.welcome_guide_photos FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = welcome_guide_photos.listing_id AND l.owner_user_id = auth.uid()));


-- ─── 5. conversations.updated_at follows the latest message ────────────────

CREATE OR REPLACE FUNCTION public.bump_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_conversation_on_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bump_conversation_on_message ON public.messages;
CREATE TRIGGER bump_conversation_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_on_message();