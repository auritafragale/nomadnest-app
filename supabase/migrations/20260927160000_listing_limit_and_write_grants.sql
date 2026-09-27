-- One listing per Pet Parent, the owner declaration, the private homeowner
-- review question, and column-level write grants.
--
-- 1. New columns (all private: none is added to a read grant).
-- 2. Column-level UPDATE (and, where members insert, INSERT) grants: members
--    can only write the columns the app writes for them. Everything else
--    changes only through the service role, SECURITY DEFINER functions or
--    admin RPCs. prevent_privilege_escalation and the other guard triggers
--    stay as defence in depth.
-- 3. Listing limit: a BEFORE INSERT trigger, get_my_settings, admin RPCs.
-- 4. Owner declaration: stamped by the database, required to publish.
-- 5. Homeowner review question: admin-only not_homeowner flag and strike.
-- 6. export_account_data: the new review flag stays out of reviews_received.


-- ─── 1. New columns ─────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS max_listings integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_max_listings_range') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_max_listings_range CHECK (max_listings BETWEEN 1 AND 10);
  END IF;
END;
$$;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS owner_declaration_accepted_at timestamptz;

-- Yes / No / Not sure from the Nomad. Private like the other flag_* columns.
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS flag_not_homeowner text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_flag_not_homeowner_values') THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_flag_not_homeowner_values
      CHECK (flag_not_homeowner IS NULL OR flag_not_homeowner IN ('yes', 'no', 'not_sure'));
  END IF;
END;
$$;


-- ─── 2. Column-level write grants ───────────────────────────────────────────
-- Revoking the table-level privilege also removes any column-level ones, so
-- each table ends up with exactly the list below. A listed column that
-- doesn't exist is skipped with a NOTICE rather than failing the migration.

DO $$
DECLARE
  spec record;
  v_cols text;
  v_missing text;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      -- Onboarding, Complete Profile, Edit Nomad / Pet Parent profile.
      -- Phone, preferred language and story name sharing go through RPCs.
      ('profiles', 'UPDATE', ARRAY[
        'first_name', 'last_name', 'full_name', 'bio', 'location', 'avatar_url', 'city', 'country']),
      -- Profiles are created by handle_new_user (SECURITY DEFINER) only.
      ('profiles', 'INSERT', ARRAY[]::text[]),

      -- Edit Nomad profile, onboarding, availability, visibility, pause.
      -- Not id_verified, background_check, phone (RPC) or the ids.
      ('sitter_profiles', 'UPDATE', ARRAY[
        'user_id', 'headline', 'bio', 'why_i_sit', 'experience_level', 'experience_details',
        'languages', 'pet_types', 'comfortable_with', 'sit_style', 'home_preferences',
        'house_rules_compatibility', 'availability_type', 'available_from', 'available_to',
        'preferred_regions', 'preferred_countries', 'preferred_cities', 'gallery', 'age_range',
        'latitude', 'longitude', 'is_visible', 'is_active']),
      ('sitter_profiles', 'INSERT', ARRAY[
        'user_id', 'headline', 'bio', 'why_i_sit', 'experience_level', 'experience_details',
        'languages', 'pet_types', 'comfortable_with', 'sit_style', 'home_preferences',
        'house_rules_compatibility', 'availability_type', 'available_from', 'available_to',
        'preferred_regions', 'preferred_countries', 'preferred_cities', 'gallery', 'age_range',
        'latitude', 'longitude', 'is_visible', 'is_active']),

      -- Edit Pet Parent profile, onboarding, pause. Phone goes through an RPC.
      ('owner_profiles', 'UPDATE', ARRAY['user_id', 'bio', 'is_active']),
      ('owner_profiles', 'INSERT', ARRAY['user_id', 'bio', 'is_active']),

      -- Edit listing, pause / unpause. Not owner_user_id, the approximate
      -- location, the time zone (derived) or the ids. The declaration time is
      -- set by the database whatever value is sent.
      ('listings', 'UPDATE', ARRAY[
        'title', 'description', 'ideal_nomad_types', 'status', 'home_type', 'location_type',
        'public_transport_accessible', 'city', 'country', 'area', 'address_private',
        'latitude', 'longitude', 'wifi_quality', 'sleeping_arrangement', 'amenities', 'photos',
        'requirements', 'requirements_other', 'house_rules', 'house_rules_other',
        'home_care_tasks', 'home_care_tasks_other', 'ideal_sitter_description',
        'communication_style', 'remote_location', 'car_needed', 'heavy_gardening',
        'wheelchair_accessible', 'owner_declaration_accepted_at']),

      -- Edit listing and the Welcome Guide. Not listing_id.
      ('pets', 'UPDATE', ARRAY[
        'name', 'type', 'age', 'personality', 'feeding_details', 'daily_routine', 'walks_exercise',
        'has_medication', 'requires_medication', 'medication_instructions', 'vet_info', 'photos',
        'separation_anxiety_tolerance', 'reactive_to_animals', 'behaviour_notes']),

      -- Edit listing dates, reopen a date. Not listing_id or is_urgent.
      ('sit_dates', 'UPDATE', ARRAY['start_date', 'end_date', 'flexibility', 'handover_preference', 'status']),

      -- Start / complete / cancel (guard_sit_update checks the transition).
      ('sits', 'UPDATE', ARRAY['status', 'completed_at']),

      -- A Nomad withdrawing (owners decide through RPCs).
      ('applications', 'UPDATE', ARRAY['status']),

      -- A Nomad answering an invite.
      ('sitter_invites', 'UPDATE', ARRAY['status']),

      -- Mark as read.
      ('notifications', 'UPDATE', ARRAY['read_at']),

      -- Settings (upsert, so user_id is in the update list).
      ('notification_preferences', 'UPDATE', ARRAY[
        'user_id', 'email_new_applications', 'email_messages', 'email_sit_updates',
        'email_reviews', 'email_application_status', 'email_membership']),

      -- Replacing documents on a pending request. Decisions go through
      -- admin_decide_id_verification.
      ('manual_id_verifications', 'UPDATE', ARRAY['id_photo_path', 'selfie_path']),

      -- Onboarding (upsert) and becoming both.
      ('user_roles', 'UPDATE', ARRAY['user_id', 'role', 'onboarding_completed']),

      -- Editing a saved Ask the Nest answer.
      ('guide_qa', 'UPDATE', ARRAY['answer', 'arrival_only']),

      -- Photo caption and instruction. Not storage_path.
      ('welcome_guide_photos', 'UPDATE', ARRAY['note', 'instruction']),

      -- Welcome Guide sections (upserts on listing_id, which RLS ties to the
      -- owner's own listing).
      ('welcome_guides', 'UPDATE', ARRAY[
        'listing_id', 'owner_user_id', 'emergency_contacts', 'out_of_hours_vet', 'house_notes',
        'bins_recycling', 'plants', 'appliances', 'heating_cooling', 'parking', 'neighbours',
        'na_fields', 'migrated_notes']),
      ('welcome_guide_access', 'UPDATE', ARRAY[
        'listing_id', 'owner_user_id', 'key_handover', 'door_codes', 'alarm_instructions',
        'wifi_details', 'na_fields'])
    ) AS t(tbl, priv, cols)
  LOOP
    EXECUTE format('REVOKE %s ON public.%I FROM PUBLIC, anon, authenticated', spec.priv, spec.tbl);

    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
      INTO v_cols
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = spec.tbl AND c.column_name = ANY (spec.cols);

    SELECT string_agg(x, ', ') INTO v_missing
    FROM unnest(spec.cols) AS x
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = spec.tbl AND c.column_name = x
    );
    IF v_missing IS NOT NULL THEN
      RAISE NOTICE '% %: skipped missing columns %', spec.tbl, spec.priv, v_missing;
    END IF;

    IF v_cols IS NOT NULL THEN
      EXECUTE format('GRANT %s (%s) ON public.%I TO authenticated', spec.priv, v_cols, spec.tbl);
    END IF;
  END LOOP;
END;
$$;


-- ─── 3. One listing per Pet Parent ──────────────────────────────────────────
-- Counts every listing the owner has (drafts, paused and published; listings
-- are hard-deleted). Existing listings are never touched: only new inserts
-- are blocked, including duplicates and direct API inserts.

CREATE OR REPLACE FUNCTION public.enforce_listing_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_count integer;
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lock the owner's profile row so two inserts at once can't both pass.
  SELECT max_listings INTO v_max FROM public.profiles WHERE id = NEW.owner_user_id FOR UPDATE;
  v_max := COALESCE(v_max, 1);

  SELECT count(*) INTO v_count FROM public.listings WHERE owner_user_id = NEW.owner_user_id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION '%',
      CASE WHEN v_max = 1
        THEN 'Your membership includes one home. Contact us if you need to list another.'
        ELSE format('Your membership includes %s homes. Contact us if you need to list another.', v_max)
      END
      USING ERRCODE = 'P0001', HINT = 'listing_limit';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_listing_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_listing_limit ON public.listings;
CREATE TRIGGER enforce_listing_limit
  BEFORE INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_listing_limit();

-- Own settings: max_listings is private, readable only here.
CREATE OR REPLACE FUNCTION public.get_my_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('preferred_language', p.preferred_language,
                            'share_name_in_stories', p.share_name_in_stories,
                            'max_listings', p.max_listings,
                            'listing_count', (SELECT count(*) FROM public.listings l WHERE l.owner_user_id = p.id))
  FROM public.profiles p
  WHERE p.id = auth.uid() AND auth.uid() IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_my_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_listing_allowance(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT jsonb_build_object(
           'max_listings', p.max_listings,
           'listing_count', (SELECT count(*) FROM public.listings l WHERE l.owner_user_id = p.id))
    INTO v_result
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_listing_allowance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_listing_allowance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_max_listings(p_user_id uuid, p_max_listings integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saved integer;
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  IF p_max_listings IS NULL OR p_max_listings < 1 OR p_max_listings > 10 THEN
    RAISE EXCEPTION 'Choose a whole number from 1 to 10';
  END IF;

  UPDATE public.profiles SET max_listings = p_max_listings
  WHERE id = p_user_id
  RETURNING max_listings INTO v_saved;

  IF v_saved IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
  RETURN v_saved;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_max_listings(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_max_listings(uuid, integer) TO authenticated;


-- ─── 4. Owner declaration ───────────────────────────────────────────────────
-- The member only says "ticked" (any value); the database records its own
-- time, once, and it can never be cleared or changed afterwards. Required
-- when a listing is created as published or goes from draft to published.
-- Pausing and unpausing an older published listing doesn't ask for it.

CREATE OR REPLACE FUNCTION public.listing_owner_declaration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.owner_declaration_accepted_at :=
      CASE WHEN NEW.owner_declaration_accepted_at IS NOT NULL THEN now() END;
    IF NEW.status = 'published' AND NEW.owner_declaration_accepted_at IS NULL THEN
      RAISE EXCEPTION 'Please confirm you own or live in this home and will manage every sit yourself before publishing.'
        USING ERRCODE = 'P0001', HINT = 'owner_declaration';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.owner_declaration_accepted_at IS NOT NULL THEN
    NEW.owner_declaration_accepted_at := OLD.owner_declaration_accepted_at;
  ELSIF NEW.owner_declaration_accepted_at IS NOT NULL THEN
    NEW.owner_declaration_accepted_at := now();
  END IF;

  IF NEW.status = 'published' AND OLD.status = 'draft' AND NEW.owner_declaration_accepted_at IS NULL THEN
    RAISE EXCEPTION 'Please confirm you own or live in this home and will manage every sit yourself before publishing.'
      USING ERRCODE = 'P0001', HINT = 'owner_declaration';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.listing_owner_declaration() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS listing_owner_declaration ON public.listings;
CREATE TRIGGER listing_owner_declaration
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.listing_owner_declaration();


-- ─── 5. Homeowner review question: admin-only flag ──────────────────────────
-- Same as before for every existing category. New: a Nomad answering "no" to
-- "Was the person you dealt with the homeowner?" adds a not_homeowner flag on
-- the listing, counted once per sit. This category is for admins only: it
-- never sets the member-facing notice (show_strike_three_warning), a later
-- "yes" doesn't reset it, and trust-strike-emails skips it. Admins see a
-- warning once it comes from 2 or more different sits.

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

  -- Admin-only: "the person you dealt with wasn't the homeowner".
  IF v_is_sitter_review AND NEW.flag_not_homeowner = 'no' THEN
    v_sit_already_flagged := EXISTS (
      SELECT 1 FROM public.community_flags
      WHERE sit_id = NEW.sit_id AND category = 'not_homeowner'
        AND subject_type = 'listing' AND subject_id = v_sit.listing_id
    );

    INSERT INTO public.community_flags (
      review_id, sit_id, reporter_user_id, subject_type, subject_id, subject_user_id, category
    ) VALUES (
      NEW.id, NEW.sit_id, NEW.reviewer_user_id, 'listing', v_sit.listing_id, v_sit.owner_user_id, 'not_homeowner'
    );

    IF NOT v_sit_already_flagged THEN
      INSERT INTO public.community_strikes (
        subject_type, subject_id, subject_user_id, category, flag_count
      ) VALUES ('listing', v_sit.listing_id, v_sit.owner_user_id, 'not_homeowner', 1)
      ON CONFLICT (subject_type, subject_id, category)
      DO UPDATE SET flag_count = public.community_strikes.flag_count + 1,
                    updated_at = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.process_review_flags() FROM PUBLIC, anon, authenticated;


-- ─── 6. Export: the new review flag stays private ───────────────────────────
-- Same as before, with flag_not_homeowner added to the columns left out of
-- reviews_received (other members' private answers about you).

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
    'reviews_received', (SELECT COALESCE(jsonb_agg(to_jsonb(rv) - ARRAY['flag_abandonment', 'flag_home_cleanliness', 'flag_pet_aggression', 'flag_pet_neglect', 'flag_sitter_cleanliness', 'flag_unauthorized_guests', 'flag_undisclosed_cameras', 'flag_not_homeowner', 'reviewer_user_id']), '[]') FROM public.reviews rv WHERE rv.reviewee_user_id = p_user_id),
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
