-- ═══════════════════════════════════════════════════════════════════════════
-- Batch 4 follow-up: bring the live database to the final batch 4 definition
-- ═══════════════════════════════════════════════════════════════════════════
--
-- An earlier revision of 20260927110000_privacy_batch4_member_rights.sql was
-- applied first (Lovable copy 20260927101625_63a1ffb2...). When the final
-- revision (d2b562c) was applied, CREATE TABLE IF NOT EXISTS skipped
-- deleted_accounts, so it kept the old shape (stripe_customers_deleted, no
-- stripe_subscriptions_cancelled / billing_records_retained), which
-- delete-account writes.
--
-- This migration re-asserts EVERY object of the final batch 4 definition,
-- idempotently, so nothing depends on which revision ran or in what order:
--   • deleted_accounts: missing columns added; stripe_customers_deleted
--     dropped (nothing uses it: only the old migration and generated types);
--     every column's type, default and NOT NULL set to the final definition.
--   • Everything else is the final batch 4 file verbatim (all of it is
--     re-runnable): the SET NULL foreign keys, nullable columns, snapshot and
--     retention columns, chat unique indexes (DROP + CREATE), RLS, grants,
--     policies (DROP + CREATE), all functions (CREATE OR REPLACE), and the
--     privacy-retention cron job (unschedule + schedule).
-- It changes no data.


-- ─── 0. deleted_accounts: final shape ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deleted_accounts (
  user_id uuid PRIMARY KEY
);

ALTER TABLE public.deleted_accounts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS safety_purge_after timestamptz,
  ADD COLUMN IF NOT EXISTS safety_purged_at timestamptz,
  ADD COLUMN IF NOT EXISTS listing_ids uuid[],
  ADD COLUMN IF NOT EXISTS stripe_subscriptions_cancelled integer,
  ADD COLUMN IF NOT EXISTS billing_records_retained boolean,
  ADD COLUMN IF NOT EXISTS onfido_applicant_deleted boolean,
  ADD COLUMN IF NOT EXISTS storage_files_deleted integer,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.deleted_accounts DROP COLUMN IF EXISTS stripe_customers_deleted;

ALTER TABLE public.deleted_accounts ALTER COLUMN deleted_at SET DEFAULT now();
UPDATE public.deleted_accounts SET deleted_at = now() WHERE deleted_at IS NULL;
ALTER TABLE public.deleted_accounts ALTER COLUMN deleted_at SET NOT NULL;

ALTER TABLE public.deleted_accounts ALTER COLUMN safety_purge_after SET DEFAULT (now() + interval '24 months');
UPDATE public.deleted_accounts SET safety_purge_after = deleted_at + interval '24 months' WHERE safety_purge_after IS NULL;
ALTER TABLE public.deleted_accounts ALTER COLUMN safety_purge_after SET NOT NULL;

ALTER TABLE public.deleted_accounts ALTER COLUMN listing_ids SET DEFAULT '{}';
UPDATE public.deleted_accounts SET listing_ids = '{}' WHERE listing_ids IS NULL;
ALTER TABLE public.deleted_accounts ALTER COLUMN listing_ids SET NOT NULL;

ALTER TABLE public.deleted_accounts ALTER COLUMN billing_records_retained SET DEFAULT true;
UPDATE public.deleted_accounts SET billing_records_retained = true WHERE billing_records_retained IS NULL;
ALTER TABLE public.deleted_accounts ALTER COLUMN billing_records_retained SET NOT NULL;

ALTER TABLE public.deleted_accounts ALTER COLUMN safety_purged_at DROP NOT NULL;
ALTER TABLE public.deleted_accounts ALTER COLUMN stripe_subscriptions_cancelled DROP NOT NULL;
ALTER TABLE public.deleted_accounts ALTER COLUMN onfido_applicant_deleted DROP NOT NULL;
ALTER TABLE public.deleted_accounts ALTER COLUMN storage_files_deleted DROP NOT NULL;
ALTER TABLE public.deleted_accounts ALTER COLUMN notes DROP NOT NULL;


-- ═══ Final batch 4 definition, verbatim from here (re-runnable) ═══════════

-- ─── 1. Foreign keys on shared records: SET NULL ───────────────────────────

DO $$
DECLARE
  t record;
  c record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('sits', 'owner_user_id'),
      ('sits', 'sitter_user_id'),
      ('sits', 'listing_id'),
      ('sits', 'sit_dates_id'),
      ('conversations', 'owner_user_id'),
      ('conversations', 'sitter_user_id'),
      ('conversations', 'pair_thread_id'),
      ('messages', 'sender_user_id'),
      ('reviews', 'reviewer_user_id'),
      ('reviews', 'reviewee_user_id'),
      ('reviews', 'sit_id'),
      ('reports', 'reporter_user_id'),
      ('community_flags', 'sit_id'),
      ('community_flags', 'review_id'),
      ('guide_questions', 'listing_id')
    ) AS v(tbl, col)
  LOOP
    FOR c IN
      SELECT con.conname,
             con.confrelid::regclass AS ref_table,
             (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = con.confrelid AND a.attnum = con.confkey[1]) AS ref_col
      FROM pg_constraint con
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
      WHERE con.contype = 'f'
        AND con.conrelid = format('public.%I', t.tbl)::regclass
        AND array_length(con.conkey, 1) = 1
        AND att.attname = t.col
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t.tbl, c.conname);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', t.tbl, t.col);
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(%I) ON DELETE SET NULL',
                     t.tbl, c.conname, t.col, c.ref_table, c.ref_col);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', t.tbl, t.col);
  END LOOP;
END;
$$;

-- Columns without a foreign key that become NULL for a former member.
ALTER TABLE public.community_flags ALTER COLUMN reporter_user_id DROP NOT NULL;
ALTER TABLE public.guide_questions ALTER COLUMN sitter_user_id DROP NOT NULL;
ALTER TABLE public.sit_checkins ALTER COLUMN author_user_id DROP NOT NULL;

-- A sit keeps what the other member needs once the listing or dates are gone.
ALTER TABLE public.sits
  ADD COLUMN IF NOT EXISTS snapshot_title text,
  ADD COLUMN IF NOT EXISTS snapshot_city text,
  ADD COLUMN IF NOT EXISTS snapshot_country text,
  ADD COLUMN IF NOT EXISTS snapshot_start_date date,
  ADD COLUMN IF NOT EXISTS snapshot_end_date date;
GRANT SELECT (snapshot_title, snapshot_city, snapshot_country, snapshot_start_date, snapshot_end_date)
ON public.sits TO authenticated;

-- Reviews about a member who left: who they were about (for retention).
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS former_reviewee_user_id uuid;

-- Chat uniqueness only while both members exist (LEAST/GREATEST ignore NULL,
-- so kept chats of former members would otherwise collide).
DROP INDEX IF EXISTS public.conversations_unique_listing_pair;
CREATE UNIQUE INDEX conversations_unique_listing_pair
  ON public.conversations (listing_id, LEAST(owner_user_id, sitter_user_id), GREATEST(owner_user_id, sitter_user_id))
  WHERE listing_id IS NOT NULL AND owner_user_id IS NOT NULL AND sitter_user_id IS NOT NULL;

DROP INDEX IF EXISTS public.conversations_unique_direct_pair;
CREATE UNIQUE INDEX conversations_unique_direct_pair
  ON public.conversations (LEAST(owner_user_id, sitter_user_id), GREATEST(owner_user_id, sitter_user_id))
  WHERE listing_id IS NULL AND owner_user_id IS NOT NULL AND sitter_user_id IS NOT NULL;


-- ─── 2. Deleted accounts ledger ────────────────────────────────────────────

-- (deleted_accounts columns: see section 0 above)

ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_accounts FROM anon, authenticated;
GRANT SELECT ON public.deleted_accounts TO authenticated;
GRANT ALL ON public.deleted_accounts TO service_role;

DROP POLICY IF EXISTS "Admins can view deleted accounts" ON public.deleted_accounts;
CREATE POLICY "Admins can view deleted accounts"
ON public.deleted_accounts FOR SELECT TO authenticated
USING (public.is_admin_user(auth.uid()));


-- ─── 3a. The member's own files (collected before any row changes) ─────────
-- Only files they uploaded; the other member's photos in shared sits and
-- chats stay.

CREATE OR REPLACE FUNCTION public.account_storage_objects(p_user_id uuid)
RETURNS TABLE (bucket_id text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH kept_evidence AS (
    -- Evidence behind flags in reviews they wrote (those reviews are kept).
    SELECT e.photo_url AS name FROM public.review_flag_evidence e
    JOIN public.reviews r ON r.id = e.review_id
    WHERE r.reviewer_user_id = p_user_id AND e.photo_url IS NOT NULL
  ), my_update_photos AS (
    SELECT unnest(c.photo_paths) AS name FROM public.sit_checkins c WHERE c.author_user_id = p_user_id
  ), my_chat_photos AS (
    SELECT m.attachment_path AS name FROM public.messages m
    WHERE m.sender_user_id = p_user_id AND m.attachment_path IS NOT NULL
  )
  SELECT o.bucket_id, o.name FROM storage.objects o
  WHERE
    (o.bucket_id IN ('listing-images', 'id-verification-documents', 'welcome-guide-photos')
      AND split_part(o.name, '/', 1) = p_user_id::text)
    OR (o.bucket_id = 'arrival-vault-photos'
      AND split_part(o.name, '/', 1) = p_user_id::text
      AND o.name NOT IN (SELECT name FROM kept_evidence))
    OR (o.bucket_id = 'sit-update-photos'
      AND (o.owner_id = p_user_id::text OR o.name IN (SELECT name FROM my_update_photos)))
    OR (o.bucket_id = 'chat-photos'
      AND (o.owner_id = p_user_id::text OR o.name IN (SELECT name FROM my_chat_photos)));
  -- Not deleted: report-evidence (kept with the reports they filed).
$function$;

REVOKE ALL ON FUNCTION public.account_storage_objects(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_storage_objects(uuid) TO service_role;


-- ─── 3b. Prepare the deletion (idempotent) ─────────────────────────────────
-- Anonymise what's kept, snapshot shared sits, delete the member's rows in
-- tables without a cascading key, and cancel their active sits (last, as the
-- member, so any late-cancellation strike is theirs, never the other
-- member's). The auth user is deleted afterwards by the edge function; the
-- SET NULL keys then detach the member from everything that's kept.

CREATE OR REPLACE FUNCTION public.prepare_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_deleted jsonb := '{}'::jsonb;
  v_n integer;
  t record;
  s record;
  v_caption text;
  v_failed integer := 0;
BEGIN
  INSERT INTO public.deleted_accounts (user_id, listing_ids)
  VALUES (p_user_id, COALESCE((SELECT array_agg(id) FROM public.listings WHERE owner_user_id = p_user_id), '{}'))
  ON CONFLICT (user_id) DO UPDATE
  SET listing_ids = (
    SELECT COALESCE(array_agg(DISTINCT x), '{}')
    FROM unnest(public.deleted_accounts.listing_ids || EXCLUDED.listing_ids) x
  );

  -- Shared sits: snapshot what the other member sees, before the listing
  -- and its dates are deleted.
  UPDATE public.sits si
  SET snapshot_title = COALESCE(si.snapshot_title, l.title),
      snapshot_city = COALESCE(si.snapshot_city, l.city),
      snapshot_country = COALESCE(si.snapshot_country, l.country),
      snapshot_start_date = COALESCE(si.snapshot_start_date, sd.start_date),
      snapshot_end_date = COALESCE(si.snapshot_end_date, sd.end_date)
  FROM public.listings l, public.sit_dates sd
  WHERE (si.owner_user_id = p_user_id OR si.sitter_user_id = p_user_id)
    AND l.id = si.listing_id AND sd.id = si.sit_dates_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('sits_snapshotted', v_n);

  -- Reviews: the ones they wrote stay public as "Former member"; the ones
  -- about them become admin-only (RLS hides reviewee_user_id IS NULL).
  UPDATE public.reviews SET former_reviewee_user_id = p_user_id WHERE reviewee_user_id = p_user_id;
  UPDATE public.reviews SET reviewer_user_id = NULL WHERE reviewer_user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('reviews_written_anonymised', v_n);

  -- Reports and flags they filed stay, without them.
  UPDATE public.reports SET reporter_user_id = NULL WHERE reporter_user_id = p_user_id;
  UPDATE public.community_flags SET reporter_user_id = NULL
  WHERE reporter_user_id = p_user_id AND subject_user_id IS DISTINCT FROM p_user_id;

  -- Daily updates they wrote: text and chips stay; their photos are deleted
  -- (files by the edge function), so the paths go.
  UPDATE public.sit_checkins SET author_user_id = NULL, photo_paths = '{}'
  WHERE author_user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('daily_updates_kept', v_n);

  -- Photo messages they sent: the photo is deleted, the caption stays.
  FOR t IN
    SELECT id, body FROM public.messages
    WHERE sender_user_id = p_user_id AND left(body, 9) = '[[image]]'
  LOOP
    BEGIN
      v_caption := NULLIF(TRIM((substr(t.body, 10)::jsonb)->>'caption'), '');
    EXCEPTION WHEN OTHERS THEN
      v_caption := NULL;
    END;
    UPDATE public.messages
    SET body = CASE WHEN v_caption IS NULL THEN '[Photo removed]' ELSE '[Photo removed] ' || v_caption END
    WHERE id = t.id;
  END LOOP;

  -- Welcome Guide questions they asked stay in the owner's history.
  UPDATE public.guide_questions SET sitter_user_id = NULL WHERE sitter_user_id = p_user_id;

  -- Deleted: the member's own rows in tables without a cascading key.
  FOR t IN
    SELECT * FROM (VALUES
      ('favorites', 'user_id'),
      ('notifications', 'user_id'),
      ('notification_preferences', 'user_id'),
      ('push_subscriptions', 'user_id'),
      ('perk_clicks', 'user_id'),
      ('review_reminders', 'user_id'),
      ('ai_usage', 'user_id'),
      ('sitter_invites', 'owner_user_id'),
      ('sitter_invites', 'sitter_user_id'),
      ('welcome_guide_access', 'owner_user_id'),
      ('welcome_guide_photos', 'owner_user_id'),
      ('arrival_vault_photos', 'sitter_user_id'),
      ('manual_id_verifications', 'user_id'),
      ('city_chat_message_reactions', 'user_id'),
      ('city_chat_thread_subscriptions', 'user_id'),
      ('city_chat_messages', 'sender_user_id')
    ) AS v(tbl, col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t.tbl AND column_name = t.col
    ) THEN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', t.tbl, t.col) USING p_user_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN
        v_deleted := v_deleted || jsonb_build_object(t.tbl || '.' || t.col, v_n);
      END IF;
    END IF;
  END LOOP;
  v_result := v_result || jsonb_build_object('deleted', v_deleted);

  -- Active sits: cancelled, and the other member is told why. Run as the
  -- departing member (this transaction only) so handle_sit_cancellation_trust
  -- records any late-cancellation strike against them, not the other member.
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  v_n := 0;
  FOR s IN
    SELECT id, owner_user_id, sitter_user_id, COALESCE(snapshot_title, 'your sit') AS title
    FROM public.sits
    WHERE (owner_user_id = p_user_id OR sitter_user_id = p_user_id)
      AND status IN ('confirmed', 'in_progress')
  LOOP
    BEGIN
      UPDATE public.sits SET status = 'cancelled' WHERE id = s.id;
    EXCEPTION WHEN OTHERS THEN
      -- Never block the deletion: the sit stays as it is, detached from them.
      RAISE WARNING 'Could not cancel sit % during account deletion: %', s.id, SQLERRM;
      v_failed := v_failed + 1;
      CONTINUE;
    END;
    INSERT INTO public.notifications (user_id, type, title, message, data)
    SELECT other_id, 'sit_cancelled', 'Sit cancelled',
           'Your sit at ' || s.title || ' was cancelled because the other member closed their NomadNest account.',
           jsonb_build_object('url', '/sits/' || s.id::text, 'sit_id', s.id::text)
    FROM (SELECT CASE WHEN s.owner_user_id = p_user_id THEN s.sitter_user_id ELSE s.owner_user_id END AS other_id) o
    WHERE other_id IS NOT NULL;
    v_n := v_n + 1;
  END LOOP;
  v_result := v_result || jsonb_build_object('active_sits_cancelled', v_n, 'active_sits_not_cancelled', v_failed);

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(uuid) TO service_role;


-- ─── 4. Data export ────────────────────────────────────────────────────────
-- Everything about the member, as JSON. Safety reports and flags ABOUT them
-- are withheld to protect the people who made them (members can ask support).

CREATE OR REPLACE FUNCTION public.export_account_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH my_listings AS (SELECT id FROM public.listings WHERE owner_user_id = p_user_id),
       my_sits AS (SELECT id FROM public.sits WHERE owner_user_id = p_user_id OR sitter_user_id = p_user_id),
       my_conversations AS (SELECT id FROM public.conversations WHERE owner_user_id = p_user_id OR sitter_user_id = p_user_id)
  SELECT jsonb_build_object(
    'exported_at', now(),
    'profile', (SELECT to_jsonb(p) - 'is_admin' - 'flagged_for_admin_review' FROM public.profiles p WHERE p.id = p_user_id),
    'sitter_profile', (SELECT to_jsonb(sp) FROM public.sitter_profiles sp WHERE sp.user_id = p_user_id),
    'owner_profile', (SELECT to_jsonb(op) FROM public.owner_profiles op WHERE op.user_id = p_user_id),
    'roles', (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]') FROM public.user_roles r WHERE r.user_id = p_user_id),
    'listings', (SELECT COALESCE(jsonb_agg(to_jsonb(l) - 'approx_latitude' - 'approx_longitude'), '[]') FROM public.listings l WHERE l.id IN (SELECT id FROM my_listings)),
    'pets', (SELECT COALESCE(jsonb_agg(to_jsonb(pt)), '[]') FROM public.pets pt WHERE pt.listing_id IN (SELECT id FROM my_listings)),
    'sit_dates', (SELECT COALESCE(jsonb_agg(to_jsonb(sd)), '[]') FROM public.sit_dates sd WHERE sd.listing_id IN (SELECT id FROM my_listings)),
    'welcome_guides', (SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]') FROM public.welcome_guides g WHERE g.listing_id IN (SELECT id FROM my_listings)),
    'welcome_guide_access', (SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]') FROM public.welcome_guide_access a WHERE a.listing_id IN (SELECT id FROM my_listings)),
    'welcome_guide_photos', (SELECT COALESCE(jsonb_agg(to_jsonb(ph)), '[]') FROM public.welcome_guide_photos ph WHERE ph.listing_id IN (SELECT id FROM my_listings)),
    'guide_qa', (SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]') FROM public.guide_qa q WHERE q.listing_id IN (SELECT id FROM my_listings)),
    'guide_questions_asked', (SELECT COALESCE(jsonb_agg(to_jsonb(gq)), '[]') FROM public.guide_questions gq WHERE gq.sitter_user_id = p_user_id),
    'applications', (SELECT COALESCE(jsonb_agg(to_jsonb(ap)), '[]') FROM public.applications ap WHERE ap.sitter_user_id = p_user_id),
    'sits', (SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]') FROM public.sits s WHERE s.id IN (SELECT id FROM my_sits)),
    'daily_updates', (SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]') FROM public.sit_checkins c WHERE c.sit_id IN (SELECT id FROM my_sits)),
    'arrival_check_in_photos', (SELECT COALESCE(jsonb_agg(to_jsonb(v)), '[]') FROM public.arrival_vault_photos v WHERE v.sitter_user_id = p_user_id),
    'conversations', (SELECT COALESCE(jsonb_agg(to_jsonb(cv)), '[]') FROM public.conversations cv WHERE cv.id IN (SELECT id FROM my_conversations)),
    'messages', (SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at), '[]') FROM public.messages m WHERE m.conversation_id IN (SELECT id FROM my_conversations)),
    'reviews_written', (SELECT COALESCE(jsonb_agg(to_jsonb(rv)), '[]') FROM public.reviews rv WHERE rv.reviewer_user_id = p_user_id),
    'reviews_received', (SELECT COALESCE(jsonb_agg(to_jsonb(rv) - ARRAY['flag_abandonment', 'flag_home_cleanliness', 'flag_pet_aggression', 'flag_pet_neglect', 'flag_sitter_cleanliness', 'flag_unauthorized_guests', 'flag_undisclosed_cameras', 'reviewer_user_id']), '[]') FROM public.reviews rv WHERE rv.reviewee_user_id = p_user_id),
    'reports_filed', (SELECT COALESCE(jsonb_agg(to_jsonb(rp)), '[]') FROM public.reports rp WHERE rp.reporter_user_id = p_user_id),
    'cancellation_strikes', (SELECT COALESCE(jsonb_agg(to_jsonb(cs)), '[]') FROM public.cancellation_strikes cs WHERE cs.user_id = p_user_id),
    'id_verification_requests', (SELECT COALESCE(jsonb_agg(jsonb_build_object('status', mv.status, 'created_at', mv.created_at, 'reviewed_at', mv.reviewed_at)), '[]') FROM public.manual_id_verifications mv WHERE mv.user_id = p_user_id),
    'notifications', (SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY n.created_at), '[]') FROM public.notifications n WHERE n.user_id = p_user_id),
    'notification_preferences', (SELECT COALESCE(jsonb_agg(to_jsonb(np)), '[]') FROM public.notification_preferences np WHERE np.user_id = p_user_id),
    'favorites', (SELECT COALESCE(jsonb_agg(to_jsonb(f)), '[]') FROM public.favorites f WHERE f.user_id = p_user_id),
    'push_devices', (SELECT COALESCE(jsonb_agg(jsonb_build_object('created_at', ps.created_at)), '[]') FROM public.push_subscriptions ps WHERE ps.user_id = p_user_id),
    'ai_features_used', (SELECT COALESCE(jsonb_agg(jsonb_build_object('feature', u.feature, 'created_at', u.created_at) ORDER BY u.created_at), '[]') FROM public.ai_usage u WHERE u.user_id = p_user_id),
    'note', 'Safety reports and flags made by other members about you are not included, to protect the people who made them. Contact support if you need them.'
  );
$function$;

REVOKE ALL ON FUNCTION public.export_account_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_account_data(uuid) TO service_role;

-- The member's own files, for signed download links in the export.
CREATE OR REPLACE FUNCTION public.export_account_files(p_user_id uuid)
RETURNS TABLE (bucket_id text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT o.bucket_id, o.name FROM storage.objects o
  WHERE (o.bucket_id IN ('listing-images', 'id-verification-documents', 'welcome-guide-photos', 'arrival-vault-photos', 'report-evidence')
         AND split_part(o.name, '/', 1) = p_user_id::text)
     OR (o.bucket_id = 'chat-photos' AND o.owner_id = p_user_id::text)
     OR (o.bucket_id = 'sit-update-photos' AND o.owner_id = p_user_id::text);
$function$;

REVOKE ALL ON FUNCTION public.export_account_files(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_account_files(uuid) TO service_role;


-- ─── 5a. Retention: ID documents 30 days after a decision ──────────────────

ALTER TABLE public.manual_id_verifications ALTER COLUMN id_photo_path DROP NOT NULL;
ALTER TABLE public.manual_id_verifications ALTER COLUMN selfie_path DROP NOT NULL;
ALTER TABLE public.manual_id_verifications ADD COLUMN IF NOT EXISTS documents_deleted_at timestamptz;

CREATE OR REPLACE FUNCTION public.expired_id_documents()
RETURNS TABLE (id uuid, id_photo_path text, selfie_path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT v.id, v.id_photo_path, v.selfie_path
  FROM public.manual_id_verifications v
  WHERE v.status IN ('approved', 'rejected')
    AND v.reviewed_at < now() - interval '30 days'
    AND v.documents_deleted_at IS NULL
  LIMIT 500;
$function$;

CREATE OR REPLACE FUNCTION public.mark_id_documents_deleted(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.manual_id_verifications
  SET id_photo_path = NULL, selfie_path = NULL, documents_deleted_at = now()
  WHERE id = ANY (p_ids) AND documents_deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.expired_id_documents() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_id_documents_deleted(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expired_id_documents() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_id_documents_deleted(uuid[]) TO service_role;


-- ─── 5b. Retention: safety records 24 months after account deletion ────────
-- Returns the report evidence files to delete (the edge function removes
-- them from storage); the rows are deleted here.

CREATE OR REPLACE FUNCTION public.purge_expired_safety_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d record;
  v_paths text[] := '{}';
  v_accounts integer := 0;
BEGIN
  FOR d IN
    SELECT * FROM public.deleted_accounts
    WHERE safety_purged_at IS NULL AND safety_purge_after < now()
    LIMIT 200
  LOOP
    SELECT v_paths || COALESCE(array_agg(p), '{}') INTO v_paths
    FROM public.reports r, unnest(COALESCE(r.evidence_paths, '{}')) p
    WHERE (r.target_type::text = 'user' AND r.target_id = d.user_id)
       OR (r.target_type::text = 'listing' AND r.target_id = ANY (d.listing_ids));

    DELETE FROM public.reports r
    WHERE (r.target_type::text = 'user' AND r.target_id = d.user_id)
       OR (r.target_type::text = 'listing' AND r.target_id = ANY (d.listing_ids));
    DELETE FROM public.community_flags WHERE subject_user_id = d.user_id;
    DELETE FROM public.community_strikes WHERE subject_user_id = d.user_id;
    DELETE FROM public.cancellation_strikes WHERE user_id = d.user_id;
    -- Reviews about them (admin-only since the deletion).
    DELETE FROM public.reviews WHERE former_reviewee_user_id = d.user_id AND reviewee_user_id IS NULL;

    UPDATE public.deleted_accounts SET safety_purged_at = now() WHERE user_id = d.user_id;
    v_accounts := v_accounts + 1;
  END LOOP;

  RETURN jsonb_build_object('accounts_purged', v_accounts, 'evidence_paths', to_jsonb(v_paths));
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_expired_safety_records() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_safety_records() TO service_role;


-- ─── 5c. Daily call to the privacy-retention edge function ─────────────────

CREATE OR REPLACE FUNCTION public.request_privacy_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'internal_trigger_secret';
  IF v_secret IS NULL THEN
    RAISE WARNING 'internal_trigger_secret missing from vault; privacy retention skipped';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/privacy-retention',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
    body    := '{}'::jsonb
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.request_privacy_retention() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'privacy-retention';
SELECT cron.schedule('privacy-retention', '15 3 * * *', $$SELECT public.request_privacy_retention();$$);


-- ─── 6. Admin: decide a manual ID verification ─────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_decide_id_verification(
  p_submission_id uuid,
  p_decision text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision.';
  END IF;

  UPDATE public.manual_id_verifications
  SET status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), notes = p_notes
  WHERE id = p_submission_id
  RETURNING user_id INTO v_user;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Submission not found.';
  END IF;

  IF p_decision = 'approved' THEN
    UPDATE public.profiles SET id_verified = true WHERE id = v_user;
  END IF;

  RETURN v_user;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_decide_id_verification(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_id_verification(uuid, text, text) TO authenticated;


-- ─── 7. Reviews about a former member: admins only ─────────────────────────

DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;
DROP POLICY IF EXISTS "Anyone can view reviews of current members" ON public.reviews;
CREATE POLICY "Anyone can view reviews of current members"
ON public.reviews FOR SELECT TO anon, authenticated
USING (reviewee_user_id IS NOT NULL);

DROP POLICY IF EXISTS "Admins can view all reviews" ON public.reviews;
CREATE POLICY "Admins can view all reviews"
ON public.reviews FOR SELECT TO authenticated
USING (public.is_admin_user(auth.uid()));


-- ─── 8. Sit updates page for sits with a former member ─────────────────────

CREATE OR REPLACE FUNCTION public.get_sit_update_context(p_sit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  s record;
  v_tz text;
  v_today date;
  v_start date;
  v_end date;
  v_other_left boolean;
BEGIN
  SELECT si.id, si.status, si.owner_user_id, si.sitter_user_id, si.listing_id,
         COALESCE(sd.start_date, si.snapshot_start_date) AS start_date,
         COALESCE(sd.end_date, si.snapshot_end_date) AS end_date,
         COALESCE(l.title, si.snapshot_title) AS title
  INTO s
  FROM public.sits si
  LEFT JOIN public.sit_dates sd ON sd.id = si.sit_dates_id
  LEFT JOIN public.listings l ON l.id = si.listing_id
  WHERE si.id = p_sit_id;

  IF NOT FOUND OR v_uid IS NULL
     OR NOT (v_uid = s.owner_user_id OR v_uid = s.sitter_user_id)
     OR s.start_date IS NULL OR s.end_date IS NULL THEN
    RETURN NULL;
  END IF;

  v_tz := COALESCE(CASE WHEN s.listing_id IS NOT NULL THEN public.listing_timezone(s.listing_id) END, 'UTC');
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_start := s.start_date;
  v_end := s.end_date;
  v_other_left := s.owner_user_id IS NULL OR s.sitter_user_id IS NULL;

  RETURN jsonb_build_object(
    'sit_id', s.id,
    'status', s.status,
    'role', CASE WHEN v_uid = s.sitter_user_id THEN 'sitter' ELSE 'owner' END,
    'listing_id', s.listing_id,
    'listing_title', COALESCE(s.title, 'your sit'),
    'owner_user_id', s.owner_user_id,
    'sitter_user_id', s.sitter_user_id,
    'other_member_left', v_other_left,
    'timezone', v_tz,
    'today', v_today,
    'start_date', v_start,
    'end_date', v_end,
    'total_days', (v_end - v_start) + 1,
    'day_number', CASE WHEN v_today BETWEEN v_start AND v_end THEN (v_today - v_start) + 1 END,
    'can_post', v_uid = s.sitter_user_id AND s.status IN ('confirmed', 'in_progress') AND NOT v_other_left,
    'owner', CASE WHEN s.owner_user_id IS NULL
                  THEN jsonb_build_object('first_name', 'Former member', 'avatar_url', NULL)
                  ELSE (SELECT jsonb_build_object('first_name', COALESCE(NULLIF(TRIM(p.first_name), ''), 'your Pet Parent'), 'avatar_url', p.avatar_url)
                        FROM public.profiles p WHERE p.id = s.owner_user_id) END,
    'sitter', CASE WHEN s.sitter_user_id IS NULL
                   THEN jsonb_build_object('first_name', 'Former member', 'avatar_url', NULL)
                   ELSE (SELECT jsonb_build_object('first_name', COALESCE(NULLIF(TRIM(p.first_name), ''), 'your Nomad'), 'avatar_url', p.avatar_url)
                         FROM public.profiles p WHERE p.id = s.sitter_user_id) END,
    'pets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', pt.name,
        'type', pt.type,
        'photo', pt.photos[1],
        'needs_medication', COALESCE(pt.requires_medication, false) OR COALESCE(pt.has_medication, false)
      ) ORDER BY pt.created_at)
      FROM public.pets pt WHERE s.listing_id IS NOT NULL AND pt.listing_id = s.listing_id
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_sit_update_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sit_update_context(uuid) TO authenticated;


-- ─── 9. Never merge the chats of a member who left ─────────────────────────
-- Same behaviour as the live function (when a listing is deleted, move its
-- chat into the pair's general chat if there is one), plus a guard: with a
-- member gone, LEAST/GREATEST would match unrelated chats of other former
-- members, so nothing is merged.

CREATE OR REPLACE FUNCTION public.merge_orphaned_listing_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing uuid;
BEGIN
  IF NOT (NEW.listing_id IS NULL AND OLD.listing_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  IF NEW.owner_user_id IS NULL OR NEW.sitter_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.id INTO v_existing
  FROM public.conversations c
  WHERE c.listing_id IS NULL
    AND c.id <> OLD.id
    AND c.owner_user_id IS NOT NULL AND c.sitter_user_id IS NOT NULL
    AND LEAST(c.owner_user_id, c.sitter_user_id) = LEAST(NEW.owner_user_id, NEW.sitter_user_id)
    AND GREATEST(c.owner_user_id, c.sitter_user_id) = GREATEST(NEW.owner_user_id, NEW.sitter_user_id)
  LIMIT 1;

  IF v_existing IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.messages SET conversation_id = v_existing WHERE conversation_id = OLD.id;
  DELETE FROM public.conversations WHERE id = OLD.id;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_orphaned_listing_conversation() FROM PUBLIC, anon, authenticated;


-- ─── 10. No new messages to a member who left ──────────────────────────────

DROP POLICY IF EXISTS "No messages to a member who left" ON public.messages;
CREATE POLICY "No messages to a member who left"
ON public.messages AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = conversation_id AND c.owner_user_id IS NOT NULL AND c.sitter_user_id IS NOT NULL
));


-- ─── 11. Hearts on a former member's update: no notification ────────────────
-- Same as before, except it never notifies a sitter who has left.

CREATE OR REPLACE FUNCTION public.toggle_checkin_heart(p_checkin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  v_owner_first text;
  v_hearted boolean;
BEGIN
  SELECT sc.id, sc.sit_id, sc.owner_heart_at, s.owner_user_id, s.sitter_user_id, COALESCE(l.title, 'your sit') AS title
  INTO c
  FROM public.sit_checkins sc
  JOIN public.sits s ON s.id = sc.sit_id
  LEFT JOIN public.listings l ON l.id = s.listing_id
  WHERE sc.id = p_checkin_id
  FOR UPDATE OF sc;

  IF NOT FOUND OR c.owner_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Update not found.' USING ERRCODE = '42501';
  END IF;

  v_hearted := c.owner_heart_at IS NULL;
  UPDATE public.sit_checkins
  SET owner_heart_at = CASE WHEN v_hearted THEN now() ELSE NULL END
  WHERE id = c.id;

  -- Once per update, even if the heart is toggled again.
  IF v_hearted AND c.sitter_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = c.sitter_user_id
      AND n.type = 'sit_update_loved'
      AND n.data->>'checkin_id' = c.id::text
  ) THEN
    SELECT COALESCE(NULLIF(TRIM(first_name), ''), 'Your Pet Parent') INTO v_owner_first
    FROM public.profiles WHERE id = c.owner_user_id;
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      c.sitter_user_id,
      'sit_update_loved',
      COALESCE(v_owner_first, 'Your Pet Parent') || ' loved today''s update',
      c.title,
      jsonb_build_object('url', '/sits/' || c.sit_id::text, 'sit_id', c.sit_id::text, 'checkin_id', c.id::text)
    );
  END IF;

  RETURN jsonb_build_object('hearted', v_hearted, 'sit_id', c.sit_id);
END;
$function$;
