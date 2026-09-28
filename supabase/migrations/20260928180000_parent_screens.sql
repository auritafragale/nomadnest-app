-- Stage 3: Pet Parent screens.
--
-- 1. Sit Stories told day by day (story_days, written by the sit-story AI).
-- 2. The Pet Parent can withdraw an approved story from the Nomad's profile
--    at any time; the Nomad is told (first name only) and can't ask again.
-- 3. get_sit_story adds the day-by-day story, the daily update count and,
--    for the Pet Parent, the share link.
-- 4. Share links: a random token the Pet Parent creates and can switch off.
--    Public readers go through the shared-story edge function only (rate
--    limited); the database never stores IP addresses, just a view count.
--    Links switch off by themselves when the story is withdrawn or either
--    member leaves.
-- 5. Reports can point at a Sit Story ("Report it" on the story).
-- 6. export_account_data includes the member's share links (no tokens).


-- ─── 1. Story by day ───────────────────────────────────────────────────────

ALTER TABLE public.sit_stories ADD COLUMN IF NOT EXISTS story_days jsonb;


-- ─── 4a. Share links table (used below) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sit_story_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.sit_stories(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  CONSTRAINT sit_story_share_links_token_shape CHECK (token ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS sit_story_share_links_story_idx ON public.sit_story_share_links (story_id);

-- Per-token, per-minute view counters for rate limiting (no IP, no user).
CREATE TABLE IF NOT EXISTS public.sit_story_share_hits (
  link_id uuid NOT NULL REFERENCES public.sit_story_share_links(id) ON DELETE CASCADE,
  minute timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (link_id, minute)
);

-- Nobody reads these tables directly: only the functions below.
ALTER TABLE public.sit_story_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sit_story_share_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sit_story_share_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.sit_story_share_hits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sit_story_share_links TO service_role;
GRANT ALL ON public.sit_story_share_hits TO service_role;

-- Switch off every link of a story.
CREATE OR REPLACE FUNCTION public.disable_sit_story_share_links(p_story_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sit_story_share_links
  SET enabled = false, disabled_at = now()
  WHERE story_id = p_story_id AND enabled;
$$;

REVOKE ALL ON FUNCTION public.disable_sit_story_share_links(uuid) FROM PUBLIC, anon, authenticated;


-- ─── 2. Withdraw from the Nomad's profile ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.withdraw_sit_story_portfolio(p_story_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st record;
  v_owner text;
BEGIN
  SELECT * INTO st FROM public.sit_stories WHERE id = p_story_id FOR UPDATE;
  IF NOT FOUND OR st.owner_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Story not found.' USING ERRCODE = '42501';
  END IF;
  IF st.portfolio_status <> 'approved' THEN
    RAISE EXCEPTION 'This story isn''t on their profile.';
  END IF;

  UPDATE public.sit_stories
  SET portfolio_status = 'revoked', portfolio_photo_paths = '{}', portfolio_decided_at = now()
  WHERE id = p_story_id;
  PERFORM public.disable_sit_story_share_links(p_story_id);

  IF st.sitter_user_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(first_name), ''), 'The Pet Parent') INTO v_owner FROM public.profiles WHERE id = st.owner_user_id;
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (st.sitter_user_id, 'sit_story_portfolio_withdrawn', 'A Sit Story was taken off your profile',
            COALESCE(v_owner, 'The Pet Parent') || ' took your Sit Story off your profile.',
            jsonb_build_object('url', '/my-sit-stories', 'story_id', p_story_id::text));
  END IF;
  RETURN 'revoked';
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_sit_story_portfolio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_sit_story_portfolio(uuid) TO authenticated;

-- Nomad: ask to show a story (or withdraw the request / remove it). A story
-- the Pet Parent withdrew can't be asked for again.
CREATE OR REPLACE FUNCTION public.set_sit_story_portfolio_request(p_story_id uuid, p_request boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  st record;
  v_sitter text;
BEGIN
  SELECT * INTO st FROM public.sit_stories WHERE id = p_story_id FOR UPDATE;
  IF NOT FOUND OR st.sitter_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Story not found.' USING ERRCODE = '42501';
  END IF;
  IF st.status <> 'ready' OR st.owner_user_id IS NULL THEN
    RAISE EXCEPTION 'This story can''t be added to your profile.';
  END IF;

  IF p_request THEN
    IF st.portfolio_status = 'revoked' THEN
      RAISE EXCEPTION 'The Pet Parent took this story off your profile, so it can''t be added again.';
    END IF;
    IF st.portfolio_status IN ('requested', 'approved') THEN
      RETURN st.portfolio_status;
    END IF;
    UPDATE public.sit_stories
    SET portfolio_status = 'requested', portfolio_requested_at = now(), portfolio_photo_paths = '{}'
    WHERE id = p_story_id;
    SELECT COALESCE(NULLIF(TRIM(first_name), ''), 'Your Nomad') INTO v_sitter FROM public.profiles WHERE id = st.sitter_user_id;
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (st.owner_user_id, 'sit_story_portfolio_request',
            COALESCE(v_sitter, 'Your Nomad') || ' would like to show your Sit Story',
            'They''d like to add it to their NomadNest profile. You choose if it appears, and which photos.',
            jsonb_build_object('url', '/stories/' || p_story_id::text, 'story_id', p_story_id::text));
    RETURN 'requested';
  END IF;

  -- Removing it (or withdrawing the request). A withdrawn story stays withdrawn.
  IF st.portfolio_status = 'revoked' THEN
    RETURN 'revoked';
  END IF;
  UPDATE public.sit_stories SET portfolio_status = 'none', portfolio_photo_paths = '{}' WHERE id = p_story_id;
  RETURN 'none';
END;
$function$;

REVOKE ALL ON FUNCTION public.set_sit_story_portfolio_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_sit_story_portfolio_request(uuid, boolean) TO authenticated;


-- ─── 3. The story page ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_sit_story(p_story_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  st record;
  v_reviewed boolean;
  v_sent integer;
  v_expected integer;
  v_interval integer;
  v_token text;
  v_views integer;
BEGIN
  SELECT ss.*, si.listing_id, COALESCE(sd.start_date, si.snapshot_start_date) AS start_date,
         COALESCE(sd.end_date, si.snapshot_end_date) AS end_date,
         COALESCE(l.city, si.snapshot_city) AS place,
         l.communication_style
  INTO st
  FROM public.sit_stories ss
  JOIN public.sits si ON si.id = ss.sit_id
  LEFT JOIN public.listings l ON l.id = si.listing_id
  LEFT JOIN public.sit_dates sd ON sd.id = si.sit_dates_id
  WHERE ss.id = p_story_id;

  IF NOT FOUND OR v_uid IS NULL OR NOT (v_uid = st.owner_user_id OR v_uid = st.sitter_user_id) THEN
    RETURN NULL;
  END IF;

  v_reviewed := EXISTS (SELECT 1 FROM public.reviews r WHERE r.sit_id = st.sit_id AND r.reviewer_user_id = v_uid);

  -- Daily updates sent, against the days an update was due (the Pet Parent's
  -- update preference: daily, or every few days / weekly plus the last day).
  SELECT count(DISTINCT COALESCE(c.local_day, c.created_at::date)) INTO v_sent
  FROM public.sit_checkins c WHERE c.sit_id = st.sit_id AND c.kind = 'daily_update';
  v_interval := CASE st.communication_style WHEN 'every_few_days' THEN 3 WHEN 'weekly' THEN 7 WHEN 'as_needed' THEN NULL ELSE 1 END;
  IF st.start_date IS NOT NULL AND st.end_date IS NOT NULL AND v_interval IS NOT NULL THEN
    v_expected := (st.end_date - st.start_date) / v_interval + 1
                  + CASE WHEN v_interval > 1 AND (st.end_date - st.start_date) % v_interval <> 0 THEN 1 ELSE 0 END;
  END IF;

  IF v_uid = st.owner_user_id THEN
    SELECT token, view_count INTO v_token, v_views
    FROM public.sit_story_share_links
    WHERE story_id = st.id AND enabled
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'id', st.id,
    'sit_id', st.sit_id,
    'status', st.status,
    'role', CASE WHEN v_uid = st.owner_user_id THEN 'owner' ELSE 'sitter' END,
    'title', st.title,
    'story', CASE WHEN st.status = 'ready' OR st.story IS NOT NULL THEN st.story END,
    'story_days', st.story_days,
    'photo_paths', to_jsonb(st.photo_paths),
    'city', st.place,
    'start_date', st.start_date,
    'end_date', st.end_date,
    'updates_sent', v_sent,
    'updates_expected', v_expected,
    'owner_user_id', st.owner_user_id,
    'sitter_user_id', st.sitter_user_id,
    'owner_first_name', CASE WHEN st.owner_user_id IS NULL THEN 'Former member'
      ELSE (SELECT COALESCE(NULLIF(TRIM(first_name), ''), 'your Pet Parent') FROM public.profiles WHERE id = st.owner_user_id) END,
    'sitter_first_name', CASE WHEN st.sitter_user_id IS NULL THEN 'Former member'
      ELSE (SELECT COALESCE(NULLIF(TRIM(first_name), ''), 'your Nomad') FROM public.profiles WHERE id = st.sitter_user_id) END,
    'sitter_avatar_url', CASE WHEN st.sitter_user_id IS NULL THEN NULL
      ELSE (SELECT avatar_url FROM public.profiles WHERE id = st.sitter_user_id) END,
    -- Share cards and links use the sitter's name only if they allow it.
    'sitter_share_name', CASE WHEN st.sitter_user_id IS NULL THEN NULL
      ELSE (SELECT CASE WHEN share_name_in_stories THEN COALESCE(NULLIF(TRIM(first_name), ''), NULL) END
            FROM public.profiles WHERE id = st.sitter_user_id) END,
    'can_review', v_uid = st.owner_user_id AND st.sitter_user_id IS NOT NULL AND NOT v_reviewed
                  AND st.end_date IS NOT NULL AND current_date <= st.end_date + 14,
    'portfolio_status', st.portfolio_status,
    'portfolio_photo_paths', to_jsonb(st.portfolio_photo_paths),
    'share_link', CASE WHEN v_token IS NULL THEN NULL
                       ELSE jsonb_build_object('token', v_token, 'views', v_views) END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_sit_story(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sit_story(uuid) TO authenticated;


-- ─── 4b. Share link functions ──────────────────────────────────────────────

-- Pet Parent: the story's share link, created on first use (64 hex
-- characters, 244 random bits). Only for a ready story with both members.
CREATE OR REPLACE FUNCTION public.create_sit_story_share_link(p_story_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st record;
  v_token text;
BEGIN
  SELECT * INTO st FROM public.sit_stories WHERE id = p_story_id FOR UPDATE;
  IF NOT FOUND OR st.owner_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Story not found.' USING ERRCODE = '42501';
  END IF;
  IF st.status <> 'ready' OR st.sitter_user_id IS NULL THEN
    RAISE EXCEPTION 'This story can''t be shared.';
  END IF;

  SELECT token INTO v_token FROM public.sit_story_share_links
  WHERE story_id = p_story_id AND enabled ORDER BY created_at DESC LIMIT 1;
  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.sit_story_share_links (story_id, token, created_by) VALUES (p_story_id, v_token, auth.uid());
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sit_story_share_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sit_story_share_link(uuid) TO authenticated;

-- Pet Parent: switch the story's link off.
CREATE OR REPLACE FUNCTION public.disable_my_sit_story_share_link(p_story_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sit_stories WHERE id = p_story_id AND owner_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Story not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.disable_sit_story_share_links(p_story_id);
END;
$$;

REVOKE ALL ON FUNCTION public.disable_my_sit_story_share_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disable_my_sit_story_share_link(uuid) TO authenticated;

-- Service role only (the shared-story edge function): count a view and say
-- whether this token is within its limit (60 views a minute).
CREATE OR REPLACE FUNCTION public.hit_shared_sit_story(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link uuid;
  v_hits integer;
BEGIN
  SELECT id INTO v_link FROM public.sit_story_share_links WHERE token = p_token AND enabled;
  IF v_link IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO public.sit_story_share_hits (link_id, minute, hits)
  VALUES (v_link, date_trunc('minute', now()), 1)
  ON CONFLICT (link_id, minute) DO UPDATE SET hits = public.sit_story_share_hits.hits + 1
  RETURNING hits INTO v_hits;
  -- Keep only the last hour of counters.
  DELETE FROM public.sit_story_share_hits WHERE link_id = v_link AND minute < now() - interval '1 hour';
  IF v_hits > 60 THEN
    RETURN false;
  END IF;
  UPDATE public.sit_story_share_links SET view_count = view_count + 1 WHERE id = v_link;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.hit_shared_sit_story(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_shared_sit_story(text) TO service_role;

-- Service role only: the shared story. City only, first names only (the
-- Nomad's only if they allow it), approved profile photos only, nothing that
-- links to anyone. Null unless the link is on and both members are here.
CREATE OR REPLACE FUNCTION public.get_shared_sit_story(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'title', ss.title,
    'story', ss.story,
    'story_days', ss.story_days,
    'city', COALESCE(l.city, si.snapshot_city),
    'month', to_char(COALESCE(sd.start_date, si.snapshot_start_date), 'FMMonth YYYY'),
    'owner_first_name', COALESCE(NULLIF(TRIM(op.first_name), ''), 'the Pet Parent'),
    'sitter_name', CASE WHEN sp.share_name_in_stories THEN NULLIF(TRIM(sp.first_name), '') END,
    'photo_paths', CASE WHEN ss.portfolio_status = 'approved' THEN to_jsonb(ss.portfolio_photo_paths) ELSE '[]'::jsonb END
  )
  FROM public.sit_story_share_links k
  JOIN public.sit_stories ss ON ss.id = k.story_id
  JOIN public.sits si ON si.id = ss.sit_id
  LEFT JOIN public.listings l ON l.id = si.listing_id
  LEFT JOIN public.sit_dates sd ON sd.id = si.sit_dates_id
  JOIN public.profiles op ON op.id = ss.owner_user_id
  JOIN public.profiles sp ON sp.id = ss.sitter_user_id
  WHERE k.token = p_token AND k.enabled AND ss.status = 'ready';
$$;

REVOKE ALL ON FUNCTION public.get_shared_sit_story(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_sit_story(text) TO service_role;

-- Links switch off when the story is withdrawn from the profile, or when
-- either member leaves (their id becomes NULL on account deletion).
CREATE OR REPLACE FUNCTION public.disable_share_links_on_story_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.portfolio_status = 'revoked' AND OLD.portfolio_status IS DISTINCT FROM 'revoked')
     OR (OLD.owner_user_id IS NOT NULL AND NEW.owner_user_id IS NULL)
     OR (OLD.sitter_user_id IS NOT NULL AND NEW.sitter_user_id IS NULL) THEN
    PERFORM public.disable_sit_story_share_links(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.disable_share_links_on_story_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS disable_share_links_on_story_change ON public.sit_stories;
CREATE TRIGGER disable_share_links_on_story_change
  AFTER UPDATE OF portfolio_status, owner_user_id, sitter_user_id ON public.sit_stories
  FOR EACH ROW EXECUTE FUNCTION public.disable_share_links_on_story_change();


-- ─── 5. Reports can point at a Sit Story ───────────────────────────────────

ALTER TYPE public.report_target_type ADD VALUE IF NOT EXISTS 'sit_story';


-- ─── 6. Export: the member's share links (never the token) ─────────────────

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
    'sit_story_share_links', (SELECT COALESCE(jsonb_agg(jsonb_build_object('story_id', k.story_id, 'created_at', k.created_at, 'enabled', k.enabled, 'disabled_at', k.disabled_at, 'views', k.view_count) ORDER BY k.created_at), '[]') FROM public.sit_story_share_links k WHERE k.created_by = p_user_id),
    'availability', (SELECT COALESCE(jsonb_agg(jsonb_build_object('start', a.start_date, 'end', a.end_date) ORDER BY a.start_date), '[]') FROM public.sitter_availability a WHERE a.sitter_user_id = p_user_id),
    'push_devices', (SELECT COALESCE(jsonb_agg(jsonb_build_object('created_at', ps.created_at)), '[]') FROM public.push_subscriptions ps WHERE ps.user_id = p_user_id),
    'ai_features_used', (SELECT COALESCE(jsonb_agg(jsonb_build_object('feature', u.feature, 'created_at', u.created_at) ORDER BY u.created_at), '[]') FROM public.ai_usage u WHERE u.user_id = p_user_id),
    'note', 'Safety reports and flags made by other members about you are not included, to protect the people who made them. Contact support if you need them.'
  );
$function$;

REVOKE ALL ON FUNCTION public.export_account_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_account_data(uuid) TO service_role;
