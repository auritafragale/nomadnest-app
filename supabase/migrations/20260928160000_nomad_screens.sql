-- Stage 2: Nomad screens.
--
-- 1. Defence in depth: signed-out visitors (anon) lose every privilege on
--    tables they never need. RLS already blocked every row; now the grants
--    match. Only listings, pets, sit_dates, reviews and perks stay readable.
-- 2. Invitations: a Pet Parent can invite only to their own listing and an
--    open date range on it, at most 20 invitations a day. accept_invite runs
--    as the Nomad, so every normal application rule still applies.
-- 3. Availability: date ranges a Nomad owns (sitter_availability), saved in
--    one step by set_my_availability, shown to others as free ranges only
--    (get_sitter_free_dates). available_from/to stay in sync for Browse.
-- 4. export_account_data includes the Nomad's availability.


-- ─── 1. Signed-out visitors: no access to member tables ────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'arrival_vault_photos', 'cancellation_strikes', 'city_chat_message_reactions', 'city_chat_messages',
    'city_chat_rooms', 'city_chat_thread_subscriptions', 'community_flags', 'community_strike_notes',
    'community_strikes', 'conversation_pair_threads', 'conversations', 'favorites', 'founding_member_codes',
    'manual_id_verifications', 'messages', 'notification_preferences', 'perk_clicks', 'push_subscriptions',
    'reliability_review_notes', 'reports', 'review_flag_evidence', 'review_reminders', 'sit_checkins',
    'sit_reschedule_requests', 'sitter_invites', 'user_roles'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    ELSE
      RAISE NOTICE 'skipped missing table %', t;
    END IF;
  END LOOP;
END;
$$;


-- ─── 2. Invitations ────────────────────────────────────────────────────────

-- Only to the Pet Parent's own published listing, for an open, upcoming date
-- range on that listing, and never to themselves.
DROP POLICY IF EXISTS "Owners can insert invites" ON public.sitter_invites;
CREATE POLICY "Owners can insert invites"
ON public.sitter_invites FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = owner_user_id
  AND sitter_user_id <> auth.uid()
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = sitter_invites.listing_id AND l.owner_user_id = auth.uid() AND l.status = 'published'
  )
  AND EXISTS (
    SELECT 1 FROM public.sit_dates sd
    WHERE sd.id = sitter_invites.sit_dates_id AND sd.listing_id = sitter_invites.listing_id
      AND sd.status = 'open' AND sd.end_date >= current_date
  )
);

-- At most 20 invitations per Pet Parent per 24 hours.
CREATE OR REPLACE FUNCTION public.limit_sitter_invites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.sitter_invites
      WHERE owner_user_id = NEW.owner_user_id AND created_at > now() - interval '24 hours') >= 20 THEN
    RAISE EXCEPTION 'You can send up to 20 invitations a day. Please try again tomorrow.'
      USING ERRCODE = 'P0001', HINT = 'invite_limit';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.limit_sitter_invites() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS limit_sitter_invites ON public.sitter_invites;
CREATE TRIGGER limit_sitter_invites
  BEFORE INSERT ON public.sitter_invites
  FOR EACH ROW EXECUTE FUNCTION public.limit_sitter_invites();

-- The invited Nomad accepts: their application goes to that Pet Parent.
-- SECURITY INVOKER on purpose: the insert runs as the Nomad, under the same
-- rules as any application (published listing, dates on it, own row, caps).
CREATE OR REPLACE FUNCTION public.accept_invite(p_invite_id uuid, p_message text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  inv record;
  v_application uuid;
BEGIN
  SELECT * INTO inv FROM public.sitter_invites
  WHERE id = p_invite_id AND sitter_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found.' USING ERRCODE = '42501';
  END IF;
  IF inv.status NOT IN ('pending', 'viewed') THEN
    RAISE EXCEPTION 'This invitation has already been answered.';
  END IF;

  INSERT INTO public.applications (listing_id, sit_dates_id, sitter_user_id, message, status)
  VALUES (
    inv.listing_id, inv.sit_dates_id, auth.uid(),
    COALESCE(NULLIF(TRIM(p_message), ''), 'Thank you for inviting me. I''d love to sit for you.'),
    'applied'
  )
  RETURNING id INTO v_application;

  UPDATE public.sitter_invites SET status = 'applied' WHERE id = p_invite_id;
  RETURN v_application;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invite(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite(uuid, text) TO authenticated;


-- ─── 3. Availability ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sitter_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sitter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sitter_availability_range CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS sitter_availability_sitter_idx ON public.sitter_availability (sitter_user_id, start_date);

ALTER TABLE public.sitter_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sitter_availability FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sitter_availability TO authenticated;
GRANT ALL ON public.sitter_availability TO service_role;

-- Nomads read their own rows; writes only through set_my_availability.
DROP POLICY IF EXISTS "Nomads read their own availability" ON public.sitter_availability;
CREATE POLICY "Nomads read their own availability"
ON public.sitter_availability FOR SELECT TO authenticated
USING (sitter_user_id = auth.uid());

-- Replace the caller's future availability with these ranges, in one step.
-- p_ranges: [{"start":"2026-10-12","end":"2026-10-25"}, ...]. Past days,
-- more than 12 months ahead, and overlaps with a booked sit are refused;
-- touching or overlapping ranges are merged.
CREATE OR REPLACE FUNCTION public.set_my_availability(p_ranges jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '42501';
  END IF;
  IF p_ranges IS NULL OR jsonb_typeof(p_ranges) <> 'array' OR jsonb_array_length(p_ranges) > 60 THEN
    RAISE EXCEPTION 'Invalid dates.';
  END IF;

  FOR r IN SELECT (x->>'start')::date AS s, (x->>'end')::date AS e FROM jsonb_array_elements(p_ranges) x LOOP
    IF r.s IS NULL OR r.e IS NULL OR r.e < r.s THEN
      RAISE EXCEPTION 'Invalid dates.';
    END IF;
    IF r.s < current_date THEN
      RAISE EXCEPTION 'Dates in the past can''t be added.';
    END IF;
    IF r.e > (current_date + interval '12 months')::date THEN
      RAISE EXCEPTION 'Add dates up to 12 months ahead.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.sits s
      LEFT JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
      WHERE s.sitter_user_id = v_uid AND s.status IN ('confirmed', 'in_progress')
        AND COALESCE(sd.start_date, s.snapshot_start_date) <= r.e
        AND COALESCE(sd.end_date, s.snapshot_end_date) >= r.s
    ) THEN
      RAISE EXCEPTION 'That range crosses a booked sit. Pick dates around it.';
    END IF;
  END LOOP;

  -- Replace future ranges (past ones are history and stay).
  DELETE FROM public.sitter_availability WHERE sitter_user_id = v_uid AND end_date >= current_date;

  -- Merge touching or overlapping ranges (gaps and islands).
  INSERT INTO public.sitter_availability (sitter_user_id, start_date, end_date)
  SELECT v_uid, min(s), max(e)
  FROM (
    SELECT s, e, sum(is_new) OVER (ORDER BY s, e) AS grp
    FROM (
      SELECT s, e,
             CASE WHEN s <= max(e) OVER (ORDER BY s, e ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) + 1
                  THEN 0 ELSE 1 END AS is_new
      FROM (SELECT (x->>'start')::date AS s, (x->>'end')::date AS e FROM jsonb_array_elements(p_ranges) x) input
    ) marked
  ) grouped
  GROUP BY grp;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('start', start_date, 'end', end_date) ORDER BY start_date)
    FROM public.sitter_availability WHERE sitter_user_id = v_uid AND end_date >= current_date
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_availability(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_availability(jsonb) TO authenticated;

-- Free dates of a Nomad, for members who can see that Nomad's profile: their
-- upcoming ranges with any booked sit days taken out. Never the booked sits,
-- where they are, or anything else.
CREATE OR REPLACE FUNCTION public.get_sitter_free_dates(p_sitter_id uuid)
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
  -- Same visibility as the Nomad's profile.
  IF NOT (
    v_uid = p_sitter_id
    OR EXISTS (SELECT 1 FROM public.sitter_profiles sp
               WHERE sp.user_id = p_sitter_id AND sp.is_active IS TRUE AND sp.is_visible IS TRUE)
    OR public.nomad_profile_shared_with_me(p_sitter_id)
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    WITH free_days AS (
      SELECT DISTINCT d::date AS day
      FROM public.sitter_availability a
      CROSS JOIN LATERAL generate_series(GREATEST(a.start_date, current_date), a.end_date, interval '1 day') d
      WHERE a.sitter_user_id = p_sitter_id AND a.end_date >= current_date
      EXCEPT
      SELECT d::date
      FROM public.sits s
      LEFT JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
      CROSS JOIN LATERAL generate_series(COALESCE(sd.start_date, s.snapshot_start_date),
                                         COALESCE(sd.end_date, s.snapshot_end_date), interval '1 day') d
      WHERE s.sitter_user_id = p_sitter_id AND s.status IN ('confirmed', 'in_progress')
    ),
    islands AS (
      SELECT day, day - (row_number() OVER (ORDER BY day))::int AS grp FROM free_days
    )
    SELECT jsonb_agg(jsonb_build_object('start', s, 'end', e, 'days', e - s + 1) ORDER BY s)
    FROM (SELECT min(day) AS s, max(day) AS e FROM islands GROUP BY grp) r
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_sitter_free_dates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sitter_free_dates(uuid) TO authenticated;

-- Keep sitter_profiles.available_from/to (used by Browse Nomads filters) in
-- step: earliest upcoming start to latest end.
CREATE OR REPLACE FUNCTION public.sync_sitter_available_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sitter uuid := COALESCE(NEW.sitter_user_id, OLD.sitter_user_id);
  v_from date;
  v_to date;
BEGIN
  SELECT min(start_date), max(end_date) INTO v_from, v_to
  FROM public.sitter_availability
  WHERE sitter_user_id = v_sitter AND end_date >= current_date;

  UPDATE public.sitter_profiles
  SET available_from = GREATEST(v_from, current_date),
      available_to = v_to,
      availability_type = CASE WHEN v_from IS NOT NULL THEN 'dates' ELSE availability_type END
  WHERE user_id = v_sitter;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_sitter_available_dates() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_sitter_available_dates ON public.sitter_availability;
CREATE TRIGGER sync_sitter_available_dates
  AFTER INSERT OR UPDATE OR DELETE ON public.sitter_availability
  FOR EACH ROW EXECUTE FUNCTION public.sync_sitter_available_dates();

-- Bring over each Nomad's current single range, if it's still upcoming.
INSERT INTO public.sitter_availability (sitter_user_id, start_date, end_date)
SELECT sp.user_id, GREATEST(sp.available_from, current_date), sp.available_to
FROM public.sitter_profiles sp
WHERE sp.available_from IS NOT NULL AND sp.available_to IS NOT NULL
  AND sp.available_to >= current_date AND sp.available_to >= sp.available_from
  AND NOT EXISTS (SELECT 1 FROM public.sitter_availability a WHERE a.sitter_user_id = sp.user_id);


-- ─── 4. Export: the Nomad's availability ───────────────────────────────────
-- Same as before, plus 'availability'.

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
    'availability', (SELECT COALESCE(jsonb_agg(jsonb_build_object('start', a.start_date, 'end', a.end_date) ORDER BY a.start_date), '[]') FROM public.sitter_availability a WHERE a.sitter_user_id = p_user_id),
    'push_devices', (SELECT COALESCE(jsonb_agg(jsonb_build_object('created_at', ps.created_at)), '[]') FROM public.push_subscriptions ps WHERE ps.user_id = p_user_id),
    'ai_features_used', (SELECT COALESCE(jsonb_agg(jsonb_build_object('feature', u.feature, 'created_at', u.created_at) ORDER BY u.created_at), '[]') FROM public.ai_usage u WHERE u.user_id = p_user_id),
    'note', 'Safety reports and flags made by other members about you are not included, to protect the people who made them. Contact support if you need them.'
  );
$function$;

REVOKE ALL ON FUNCTION public.export_account_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_account_data(uuid) TO service_role;
