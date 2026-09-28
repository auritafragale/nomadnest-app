-- Stage 4: AI.
--
-- 1. Two feature flags, both off (admins can use the features while off):
--    availability_ai_enabled ("Suggest my dates") and photo_alt_text_enabled.
-- 2. sit_stories.photo_alt: a short description per photo (path -> text),
--    written once by the photo-alt-text function when a story becomes ready.
-- 3. The story functions return alt text only for photos the reader may see
--    (all of them for the two members; approved ones on profiles and links).


-- ─── 1. Flags ──────────────────────────────────────────────────────────────

INSERT INTO public.app_settings (key, value)
VALUES ('availability_ai_enabled', 'false'::jsonb), ('photo_alt_text_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- ─── 2. Alt text ───────────────────────────────────────────────────────────

ALTER TABLE public.sit_stories ADD COLUMN IF NOT EXISTS photo_alt jsonb;

-- When a story becomes ready, ask for its photos' alt text once, if the
-- feature is on. The function checks again and skips photos already done.
CREATE OR REPLACE FUNCTION public.queue_photo_alt_text()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ready' AND OLD.status IS DISTINCT FROM 'ready'
     AND cardinality(NEW.photo_paths) > 0
     AND COALESCE((SELECT value = 'true'::jsonb FROM public.app_settings WHERE key = 'photo_alt_text_enabled'), false) THEN
    PERFORM public.request_internal_function('photo-alt-text', jsonb_build_object('story_id', NEW.id));
  END IF;
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'photo-alt-text not queued for story %: %', NEW.id, SQLERRM;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_photo_alt_text() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS queue_photo_alt_text ON public.sit_stories;
CREATE TRIGGER queue_photo_alt_text
  AFTER UPDATE OF status ON public.sit_stories
  FOR EACH ROW EXECUTE FUNCTION public.queue_photo_alt_text();

-- Admins: write alt text now for one ready story (e.g. stories from before
-- the feature was switched on). Admins can use it while the flag is off.
CREATE OR REPLACE FUNCTION public.admin_queue_photo_alt_text(p_story_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sit_stories WHERE id = p_story_id AND status = 'ready') THEN
    RAISE EXCEPTION 'That story isn''t ready.';
  END IF;
  PERFORM public.request_internal_function('photo-alt-text', jsonb_build_object('story_id', p_story_id, 'by_admin', true));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_queue_photo_alt_text(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_queue_photo_alt_text(uuid) TO authenticated;


-- ─── 3. Story functions with alt text ──────────────────────────────────────

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
    'photo_alt', COALESCE(st.photo_alt, '{}'::jsonb),
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

CREATE OR REPLACE FUNCTION public.get_portfolio_story(p_story_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', ss.id,
    'title', ss.title,
    'story', ss.story,
    'city', COALESCE(l.city, si.snapshot_city),
    'photo_paths', to_jsonb(ss.portfolio_photo_paths),
    'photo_alt', COALESCE((SELECT jsonb_object_agg(a.key, a.value) FROM jsonb_each(ss.photo_alt) a WHERE a.key = ANY (ss.portfolio_photo_paths)), '{}'::jsonb),
    'sitter_user_id', ss.sitter_user_id,
    'ready_at', ss.ready_at
  )
  FROM public.sit_stories ss
  JOIN public.sits si ON si.id = ss.sit_id
  LEFT JOIN public.listings l ON l.id = si.listing_id
  WHERE auth.uid() IS NOT NULL
    AND ss.id = p_story_id
    AND ss.portfolio_status = 'approved'
    AND ss.status = 'ready';
$function$;

REVOKE ALL ON FUNCTION public.get_portfolio_story(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_portfolio_story(uuid) TO authenticated;

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
    'photo_paths', CASE WHEN ss.portfolio_status = 'approved' THEN to_jsonb(ss.portfolio_photo_paths) ELSE '[]'::jsonb END,
    'photo_alt', CASE WHEN ss.portfolio_status = 'approved'
      THEN COALESCE((SELECT jsonb_object_agg(a.key, a.value) FROM jsonb_each(ss.photo_alt) a WHERE a.key = ANY (ss.portfolio_photo_paths)), '{}'::jsonb)
      ELSE '{}'::jsonb END
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