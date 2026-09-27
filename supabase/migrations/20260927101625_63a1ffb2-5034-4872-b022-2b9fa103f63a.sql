-- ═══════════════════════════════════════════════════════════════════════════
-- Privacy hardening, batch 4: account deletion, data export, retention
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Deletion rules (agreed):
--   • Reviews the member WROTE are kept, anonymised as "Former member"
--     (reviewer_user_id = NULL; no name, photo or profile link).
--   • Reports and community flags they FILED are kept, reporter removed
--     (admins only, as before).
--   • Safety records ABOUT them (community flags, community strikes,
--     cancellation strikes, reports about them or their listings) are kept for
--     24 months after deletion, then deleted by the daily retention job.
--   • Everything else is deleted: rows here and in the delete-account edge
--     function, storage files by bucket and folder, the Stripe customer (which
--     cancels the membership) and the Onfido applicant.
--
-- 1. Foreign keys: deleting an account cascades through sits, which used to
--    delete every review and flag on those sits (including the OTHER person's
--    reviews and the safety flags about the deleted member). These now SET
--    NULL instead: reviews.reviewer_user_id, reviews.sit_id, reports.
--    reporter_user_id, community_flags.sit_id and community_flags.review_id.
-- 2. deleted_accounts: a small ledger (user id, dates, what was done) so the
--    retention job knows when to purge safety records. Admins can read it.
-- 3. Service-role helpers used by delete-account: account_storage_objects()
--    (every file to delete, collected BEFORE rows go) and
--    prepare_account_deletion() (anonymise, record, delete rows without FKs).
-- 4. export_account_data(): the member's data as JSON (used by export-my-data).
-- 5. Retention: ID documents are deleted 30 days after an admin decision;
--    safety records 24 months after account deletion. The privacy-retention
--    edge function runs daily (pg_cron -> pg_net, secret from Vault).
-- 6. admin_decide_id_verification(): one admin-checked RPC for approving or
--    rejecting a manual ID check (members can't update profiles.id_verified,
--    so the old two-step client update failed on the second step).
--
-- SECRETS: none here; the cron call reads internal_trigger_secret from Vault.


-- ─── 1. Foreign keys that must not cascade on account deletion ─────────────

DO $$
DECLARE
  t record;
  c record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('reviews', 'reviewer_user_id'),
      ('reviews', 'sit_id'),
      ('reports', 'reporter_user_id'),
      ('community_flags', 'sit_id'),
      ('community_flags', 'review_id')
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
    -- Nullable either way (no FK found = nothing to re-point).
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', t.tbl, t.col);
  END LOOP;
END;
$$;

-- Flags a deleted member filed keep their subject, lose their reporter.
ALTER TABLE public.community_flags ALTER COLUMN reporter_user_id DROP NOT NULL;


-- ─── 2. Deleted accounts ledger ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deleted_accounts (
  user_id uuid PRIMARY KEY,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  -- Safety records about the member are deleted after this date.
  safety_purge_after timestamptz NOT NULL DEFAULT (now() + interval '24 months'),
  safety_purged_at timestamptz,
  -- Their listings at deletion time (reports about those listings are safety
  -- records about them too).
  listing_ids uuid[] NOT NULL DEFAULT '{}',
  stripe_customers_deleted integer,
  onfido_applicant_deleted boolean,
  storage_files_deleted integer,
  notes text
);

ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_accounts FROM anon, authenticated;
GRANT SELECT ON public.deleted_accounts TO authenticated;
GRANT ALL ON public.deleted_accounts TO service_role;

DROP POLICY IF EXISTS "Admins can view deleted accounts" ON public.deleted_accounts;
CREATE POLICY "Admins can view deleted accounts"
ON public.deleted_accounts FOR SELECT TO authenticated
USING (public.is_admin_user(auth.uid()));


-- ─── 3a. Files to delete (collected before any row is removed) ─────────────

CREATE OR REPLACE FUNCTION public.account_storage_objects(p_user_id uuid)
RETURNS TABLE (bucket_id text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH my_sits AS (
    SELECT id::text AS id FROM public.sits WHERE owner_user_id = p_user_id OR sitter_user_id = p_user_id
  ), my_conversations AS (
    SELECT id FROM public.conversations WHERE owner_user_id = p_user_id OR sitter_user_id = p_user_id
  ), kept_evidence AS (
    -- Evidence behind flags in reviews they wrote (those reviews are kept).
    SELECT e.photo_url AS name FROM public.review_flag_evidence e
    JOIN public.reviews r ON r.id = e.review_id
    WHERE r.reviewer_user_id = p_user_id AND e.photo_url IS NOT NULL
  )
  SELECT o.bucket_id, o.name FROM storage.objects o
  WHERE
    (o.bucket_id IN ('listing-images', 'id-verification-documents', 'welcome-guide-photos')
      AND split_part(o.name, '/', 1) = p_user_id::text)
    OR (o.bucket_id = 'arrival-vault-photos'
      AND split_part(o.name, '/', 1) = p_user_id::text
      AND o.name NOT IN (SELECT name FROM kept_evidence))
    OR (o.bucket_id = 'sit-update-photos'
      AND split_part(o.name, '/', 1) IN (SELECT id FROM my_sits))
    OR (o.bucket_id = 'chat-photos'
      AND (split_part(o.name, '/', 1) IN (SELECT id::text FROM my_conversations)
           OR o.name IN (SELECT m.attachment_path FROM public.messages m
                         WHERE m.conversation_id IN (SELECT id FROM my_conversations)
                           AND m.attachment_path IS NOT NULL)));
  -- Not deleted: report-evidence (kept with the reports they filed).
$function$;

REVOKE ALL ON FUNCTION public.account_storage_objects(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_storage_objects(uuid) TO service_role;


-- ─── 3b. Anonymise, record, and delete rows that don't cascade ─────────────
-- Idempotent: safe to run again if a deletion is retried.

CREATE OR REPLACE FUNCTION public.prepare_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reviews integer;
  v_reports integer;
  v_flags integer;
  v_deleted jsonb := '{}'::jsonb;
  v_n integer;
  t record;
BEGIN
  INSERT INTO public.deleted_accounts (user_id, listing_ids)
  VALUES (p_user_id, COALESCE((SELECT array_agg(id) FROM public.listings WHERE owner_user_id = p_user_id), '{}'))
  ON CONFLICT (user_id) DO UPDATE
  SET listing_ids = (
    SELECT COALESCE(array_agg(DISTINCT x), '{}')
    FROM unnest(public.deleted_accounts.listing_ids || EXCLUDED.listing_ids) x
  );

  -- Kept, anonymised.
  UPDATE public.reviews SET reviewer_user_id = NULL WHERE reviewer_user_id = p_user_id;
  GET DIAGNOSTICS v_reviews = ROW_COUNT;
  UPDATE public.reports SET reporter_user_id = NULL WHERE reporter_user_id = p_user_id;
  GET DIAGNOSTICS v_reports = ROW_COUNT;
  UPDATE public.community_flags SET reporter_user_id = NULL
  WHERE reporter_user_id = p_user_id AND subject_user_id IS DISTINCT FROM p_user_id;
  GET DIAGNOSTICS v_flags = ROW_COUNT;

  -- Deleted: the member's rows in tables without a cascading key to them.
  FOR t IN
    SELECT * FROM (VALUES
      ('favorites', 'user_id'),
      ('notifications', 'user_id'),
      ('notification_preferences', 'user_id'),
      ('push_subscriptions', 'user_id'),
      ('perk_clicks', 'user_id'),
      ('review_reminders', 'user_id'),
      ('ai_usage', 'user_id'),
      ('guide_questions', 'sitter_user_id'),
      ('sitter_invites', 'owner_user_id'),
      ('sitter_invites', 'sitter_user_id'),
      ('welcome_guide_access', 'owner_user_id'),
      ('welcome_guide_photos', 'owner_user_id'),
      ('sit_checkins', 'author_user_id'),
      ('arrival_vault_photos', 'sitter_user_id'),
      ('manual_id_verifications', 'user_id'),
      ('city_chat_message_reactions', 'user_id'),
      ('city_chat_thread_subscriptions', 'user_id'),
      ('city_chat_messages', 'sender_user_id'),
      ('conversation_pair_threads', 'user_a_id'),
      ('conversation_pair_threads', 'user_b_id')
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

  RETURN jsonb_build_object(
    'reviews_anonymised', v_reviews,
    'reports_anonymised', v_reports,
    'flags_anonymised', v_flags,
    'deleted', v_deleted
  );
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