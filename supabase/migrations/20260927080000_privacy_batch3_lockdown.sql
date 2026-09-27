-- ═══════════════════════════════════════════════════════════════════════════
-- Privacy hardening, batch 3: lock down direct access
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Run only after batch 1 (20260927060000) is live: the app already reads
-- private data through the RPCs and approximate columns it added.
--
-- WHY THE OLD COLUMN REVOKES DIDN'T WORK: Supabase grants anon/authenticated
-- a table-level SELECT by default, and "REVOKE SELECT (col)" does nothing while
-- a table-level grant exists. So every table here is fixed the way pets and
-- listings were: REVOKE the table-level SELECT, then GRANT an explicit column
-- list. A NEW COLUMN ON THESE TABLES IS NOT READABLE by anon/authenticated
-- until it's added to the list below (on purpose: private by default).
--
--  1. profiles: display columns only (email, admin, membership, Onfido, phone,
--     reliability, review flags, preferred_language are private; own private
--     fields come from get_my_* RPCs).
--  2. reviews: everything except the private flag_* columns.
--  3. sitter_profiles / owner_profiles: the columns public pages use (no
--     phone, no social_links).
--  4. listings: exact latitude/longitude become private (public pages use
--     approx_*; the owner uses get_listing_exact_location).
--  5. listing-images: nobody can LIST the bucket any more (public files still
--     load by URL); owners can still see/delete files in their own folder.
--  6. community_strikes: admins only (members use get_community_warnings).
--  7. messages: members can't UPDATE messages (read receipts use an RPC).
--     messages.attachment_path: chat photo access follows the message, so
--     photos stay readable after merge_orphaned_listing_conversation moves
--     messages into another conversation.
--  8. log_sit_abandonment_flag: owner only, only during the sit or within 7
--     days after it (home's local time), one direct report per sit; strikes
--     count distinct sits (process_review_flags too).
--  9. SECURITY DEFINER functions: nobody signed out can execute them (except
--     is_owner_active, used by public listing policies); trigger functions
--     can't be called by members either. New functions no longer get PUBLIC
--     or anon EXECUTE by default.
-- 10. Drop welcome_guides_backup_20260926 (old guide copies incl. Wi-Fi).


-- ─── 1. profiles ───────────────────────────────────────────────────────────

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, first_name, last_name, full_name, avatar_url, bio, location, city, country,
  id_verified, email_verified, phone_verified, founding_badge, created_at, updated_at
) ON public.profiles TO anon, authenticated;


-- ─── 2. reviews ────────────────────────────────────────────────────────────

REVOKE SELECT ON public.reviews FROM anon, authenticated;
GRANT SELECT (
  id, sit_id, reviewer_user_id, reviewee_user_id, rating, text, created_at,
  rating_cleanliness, rating_clear_expectations, rating_communication, rating_home_accuracy,
  rating_hospitality, rating_pet_care, rating_pet_preparedness, rating_reliability, rating_respect_home
) ON public.reviews TO anon, authenticated;


-- ─── 3. sitter_profiles / owner_profiles ───────────────────────────────────

REVOKE SELECT ON public.sitter_profiles FROM anon, authenticated;
GRANT SELECT (
  id, user_id, headline, bio, why_i_sit, experience_level, experience_details, languages,
  comfortable_with, pet_types, sit_style, home_preferences, house_rules_compatibility,
  availability_type, available_from, available_to, preferred_regions, preferred_countries,
  preferred_cities, id_verified, background_check, gallery, age_range, created_at, updated_at,
  is_active, latitude, longitude, is_visible
) ON public.sitter_profiles TO anon, authenticated;

REVOKE SELECT ON public.owner_profiles FROM anon, authenticated;
GRANT SELECT (id, user_id, bio, created_at, updated_at, is_active)
ON public.owner_profiles TO anon, authenticated;


-- ─── 4. listings: exact coordinates private ────────────────────────────────

DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'listings'
    AND column_name NOT IN ('address_private', 'latitude', 'longitude');

  EXECUTE 'REVOKE SELECT ON public.listings FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.listings TO anon, authenticated', v_cols);
END;
$$;


-- ─── 5. listing-images: no listing of the bucket ───────────────────────────
-- Public buckets serve files by URL without any SELECT policy. The policy
-- only allowed LISTING every file (which exposed private chat photos).
-- Deleting/replacing a file needs SELECT on it, so owners keep their folder.

DROP POLICY IF EXISTS "Anyone can view listing images" ON storage.objects;

DROP POLICY IF EXISTS "Members see files in their own listing-images folder" ON storage.objects;
CREATE POLICY "Members see files in their own listing-images folder"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);


-- ─── 6. community_strikes: admins only ─────────────────────────────────────

DROP POLICY IF EXISTS "Members can see active strike-three warnings" ON public.community_strikes;
DROP POLICY IF EXISTS "Admins can view community strikes" ON public.community_strikes;
CREATE POLICY "Admins can view community strikes"
ON public.community_strikes FOR SELECT TO authenticated
USING (public.is_admin_user(auth.uid()));


-- ─── 7. messages ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
REVOKE UPDATE ON public.messages FROM anon, authenticated;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_path text;
CREATE INDEX IF NOT EXISTS messages_attachment_path_idx
  ON public.messages (attachment_path) WHERE attachment_path IS NOT NULL;

-- Backfill the photos sent since batch 1 (before the trigger below, which
-- keeps attachment_path unchanged on UPDATE). Bad JSON is skipped.
DO $$
DECLARE
  m record;
  v_path text;
BEGIN
  FOR m IN
    SELECT id, body, conversation_id FROM public.messages
    WHERE left(body, 9) = '[[image]]' AND attachment_path IS NULL AND body LIKE '%"path"%'
  LOOP
    BEGIN
      v_path := (substr(m.body, 10)::jsonb)->>'path';
    EXCEPTION WHEN OTHERS THEN
      v_path := NULL;
    END;
    IF v_path IS NOT NULL AND public.chat_photo_conversation(v_path) = m.conversation_id THEN
      UPDATE public.messages SET attachment_path = v_path WHERE id = m.id;
    END IF;
  END LOOP;
END;
$$;

-- Set once, at insert, from an [[image]] body — and only if the photo's
-- folder is this message's own conversation, so nobody can claim someone
-- else's photo by putting its path in a message. Never changed afterwards
-- (the merge trigger moves the message, and access follows it).
CREATE OR REPLACE FUNCTION public.set_message_attachment_path()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_path text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.attachment_path := OLD.attachment_path;
    RETURN NEW;
  END IF;

  NEW.attachment_path := NULL;
  IF left(NEW.body, 9) = '[[image]]' THEN
    BEGIN
      v_path := (substr(NEW.body, 10)::jsonb)->>'path';
    EXCEPTION WHEN OTHERS THEN
      v_path := NULL;
    END;
    IF v_path IS NOT NULL
       AND public.chat_photo_conversation(v_path) = NEW.conversation_id
       AND v_path ~ '^[0-9a-fA-F-]{36}/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$' THEN
      NEW.attachment_path := v_path;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_message_attachment_path ON public.messages;
CREATE TRIGGER set_message_attachment_path
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.set_message_attachment_path();

-- Read: a member of the conversation the message is in now (follows merges),
-- or of the folder's conversation (e.g. just uploaded), or an admin.
CREATE OR REPLACE FUNCTION public.can_read_chat_photo(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      WHERE m.attachment_path = p_name
        AND auth.uid() IN (c.owner_user_id, c.sitter_user_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = public.chat_photo_conversation(p_name)
        AND auth.uid() IN (c.owner_user_id, c.sitter_user_id)
    )
    OR public.is_admin_user(auth.uid())
  );
$function$;


-- ─── 8. Abandonment reports ────────────────────────────────────────────────

-- Safety no-op (none on the live database): keep only the earliest direct
-- abandonment report per sit before adding the unique index.
DELETE FROM public.community_flags f
USING public.community_flags keep
WHERE f.category = 'abandonment' AND f.review_id IS NULL AND f.sit_id IS NOT NULL
  AND keep.category = 'abandonment' AND keep.review_id IS NULL AND keep.sit_id = f.sit_id
  AND (keep.created_at, keep.id) < (f.created_at, f.id);

-- One direct report per sit. (Review flags carry a review_id and are
-- counted by sit below, so they don't double-count either.)
CREATE UNIQUE INDEX IF NOT EXISTS community_flags_one_abandonment_report_per_sit
  ON public.community_flags (sit_id)
  WHERE category = 'abandonment' AND review_id IS NULL;

CREATE OR REPLACE FUNCTION public.log_sit_abandonment_flag(p_sit_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  v_ends_at timestamptz;
  v_count integer;
BEGIN
  SELECT id, owner_user_id, sitter_user_id, status, cancelled_at, cancelled_from_status
  INTO s
  FROM public.sits WHERE id = p_sit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sit not found';
  END IF;
  IF auth.uid() IS NULL OR s.owner_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the Pet Parent for this sit may report this' USING ERRCODE = '42501';
  END IF;

  -- During the sit, or within 7 days after it (home's local time).
  SELECT w.ends_at INTO v_ends_at FROM public.sit_guide_window(s.id) w;
  IF NOT (
    s.status = 'in_progress'
    OR (s.status = 'cancelled' AND s.cancelled_from_status = 'in_progress'
        AND s.cancelled_at IS NOT NULL AND now() < s.cancelled_at + interval '7 days')
    OR (s.status = 'completed' AND v_ends_at IS NOT NULL AND now() < v_ends_at + interval '7 days')
  ) THEN
    RAISE EXCEPTION 'You can only report this during the sit or within 7 days after it ends.';
  END IF;

  -- One per sit (from a direct report or a review flag).
  IF EXISTS (
    SELECT 1 FROM public.community_flags
    WHERE sit_id = s.id AND category = 'abandonment'
      AND subject_type = 'user' AND subject_id = s.sitter_user_id
  ) THEN
    RAISE EXCEPTION 'You''ve already reported this for this sit.';
  END IF;

  BEGIN
    INSERT INTO public.community_flags (
      sit_id, reporter_user_id, subject_type, subject_id, subject_user_id, category, note
    ) VALUES (
      s.id, auth.uid(), 'user', s.sitter_user_id, s.sitter_user_id, 'abandonment', NULLIF(TRIM(p_note), '')
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You''ve already reported this for this sit.';
  END;

  -- A new sit for this sitter and category: +1.
  INSERT INTO public.community_strikes (subject_type, subject_id, subject_user_id, category, flag_count)
  VALUES ('user', s.sitter_user_id, s.sitter_user_id, 'abandonment', 1)
  ON CONFLICT (subject_type, subject_id, category)
  DO UPDATE SET flag_count = public.community_strikes.flag_count + 1, updated_at = now()
  RETURNING flag_count INTO v_count;

  IF v_count >= 3 THEN
    UPDATE public.community_strikes
    SET show_strike_three_warning = true, updated_at = now()
    WHERE subject_type = 'user' AND subject_id = s.sitter_user_id AND category = 'abandonment';
  END IF;
END;
$function$;

-- Review flags: same rules as before, except that a sit already flagged in a
-- category (e.g. by a direct abandonment report) adds nothing and never
-- counts as a "clean" sit that resets the strike.
CREATE OR REPLACE FUNCTION public.process_review_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sit public.sits%ROWTYPE;
  v_is_sitter_review boolean;
  v_subject_type text;
  v_subject_id uuid;
  v_subject_user uuid;
  v_categories text[];
  v_flagged text[];
  v_cat text;
  v_count integer;
  v_sit_already_flagged boolean;
BEGIN
  SELECT * INTO v_sit FROM public.sits WHERE id = NEW.sit_id;
  IF v_sit.id IS NULL THEN RETURN NEW; END IF;

  -- Reviewer is the nomad => the home / Pet Parent is the subject.
  v_is_sitter_review := (NEW.reviewer_user_id = v_sit.sitter_user_id);

  IF v_is_sitter_review THEN
    v_subject_type := 'listing';
    v_subject_id := v_sit.listing_id;
    v_subject_user := v_sit.owner_user_id;
    v_categories := ARRAY['home_cleanliness', 'undisclosed_cameras', 'pet_aggression'];
    v_flagged := ARRAY[]::text[];
    IF NEW.flag_home_cleanliness THEN v_flagged := v_flagged || 'home_cleanliness'; END IF;
    IF NEW.flag_undisclosed_cameras THEN v_flagged := v_flagged || 'undisclosed_cameras'; END IF;
    IF NEW.flag_pet_aggression THEN v_flagged := v_flagged || 'pet_aggression'; END IF;
  ELSE
    v_subject_type := 'user';
    v_subject_id := v_sit.sitter_user_id;
    v_subject_user := v_sit.sitter_user_id;
    v_categories := ARRAY['sitter_cleanliness', 'pet_neglect', 'abandonment'];
    v_flagged := ARRAY[]::text[];
    IF NEW.flag_sitter_cleanliness THEN v_flagged := v_flagged || 'sitter_cleanliness'; END IF;
    IF NEW.flag_pet_neglect THEN v_flagged := v_flagged || 'pet_neglect'; END IF;
    IF NEW.flag_abandonment THEN v_flagged := v_flagged || 'abandonment'; END IF;
  END IF;

  FOREACH v_cat IN ARRAY v_categories LOOP
    v_sit_already_flagged := EXISTS (
      SELECT 1 FROM public.community_flags
      WHERE sit_id = NEW.sit_id AND category = v_cat
        AND subject_type = v_subject_type AND subject_id = v_subject_id
    );

    IF v_cat = ANY (v_flagged) THEN
      INSERT INTO public.community_flags (
        review_id, sit_id, reporter_user_id, subject_type, subject_id, subject_user_id, category
      ) VALUES (
        NEW.id, NEW.sit_id, NEW.reviewer_user_id, v_subject_type, v_subject_id, v_subject_user, v_cat
      );

      IF NOT v_sit_already_flagged THEN
        INSERT INTO public.community_strikes (
          subject_type, subject_id, subject_user_id, category, flag_count
        ) VALUES (v_subject_type, v_subject_id, v_subject_user, v_cat, 1)
        ON CONFLICT (subject_type, subject_id, category)
        DO UPDATE SET flag_count = public.community_strikes.flag_count + 1,
                      updated_at = now()
        RETURNING flag_count INTO v_count;

        IF v_count >= 3 THEN
          UPDATE public.community_strikes
          SET show_strike_three_warning = true, updated_at = now()
          WHERE subject_type = v_subject_type AND subject_id = v_subject_id AND category = v_cat;
        END IF;
      END IF;
    ELSIF NOT v_sit_already_flagged THEN
      -- Redemption: a clean next sit resets this category entirely.
      UPDATE public.community_strikes
      SET flag_count = 0,
          show_strike_three_warning = false,
          strike_two_email_sent_at = NULL,
          updated_at = now()
      WHERE subject_type = v_subject_type
        AND subject_id = v_subject_id
        AND category = v_cat
        AND flag_count > 0;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- ─── 9. SECURITY DEFINER functions: no signed-out execution ────────────────

DO $$
DECLARE
  r record;
  v_auth boolean;
  v_service boolean;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig, pg_get_function_result(p.oid) AS result
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    -- Keep whatever members and the service role could run before
    -- (including through PUBLIC).
    v_auth := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    v_service := has_function_privilege('service_role', r.oid, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF v_service THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    END IF;
    IF r.result = 'trigger' THEN
      -- Trigger functions run as triggers only; nobody calls them directly.
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
    ELSIF v_auth THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END;
$$;

-- Used by the public listings / pets policies, which anon evaluates.
GRANT EXECUTE ON FUNCTION public.is_owner_active(uuid) TO anon;

-- The abandonment report is a member RPC (other member RPCs, such as
-- respond_to_sit_reschedule, keep their access through the loop above).
GRANT EXECUTE ON FUNCTION public.log_sit_abandonment_flag(uuid, text) TO authenticated;

-- New functions: no EXECUTE for PUBLIC or anon unless granted explicitly.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;


-- ─── 10. Old guide backup ──────────────────────────────────────────────────

DROP TABLE IF EXISTS public.welcome_guides_backup_20260926;
