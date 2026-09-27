-- ═══════════════════════════════════════════════════════════════════════════
-- Sit Story + chat update pill per sit
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. get_conversation_active_sits: every live sit between the two members of
--    a chat (home's local day, sent/due today from sit_update_due), for the
--    chat pill ("Clare's update for Delhi New Home: sent today").
-- 2. profiles.share_name_in_stories (default on): the sitter's choice for
--    share cards; set with set_my_story_name_sharing, read via get_my_settings.
-- 3. sit_stories: one story per completed sit (2+ daily updates), written by
--    the sit-story edge function. Owner and sitter read it (RLS); every change
--    goes through the functions below.
-- 4. queue_sit_story (AFTER UPDATE on sits -> completed): queues sit-story via
--    request_internal_function; never blocks the completion. Flag
--    sit_story_enabled (default off; runs while off if owner or sitter is an
--    admin). requeue_sit_stories (every 15 min) retries a failed or stuck
--    story once. admin_queue_sit_story: admin-only, for testing.
-- 5. get_sit_story (the private page), request_sit_story_rewrite (once per
--    story), request / decide / revoke portfolio, get_sitter_portfolio.
-- 6. Update photos: members can read a photo only if they're in the sit, or
--    while it's one of the approved portfolio photos of an approved story.
-- 7. Quiet in-app notification for the sitter (no push); delete-account ends
--    portfolio approvals and drops a departing sitter's photos from stories.
--
-- Story text is never logged. SECRETS: none here.


-- ─── 1. Chat pill: live sits between two members ───────────────────────────

CREATE OR REPLACE FUNCTION public.get_conversation_active_sits(p_conversation_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'sit_id', s.id,
      'listing_title', COALESCE(l.title, s.snapshot_title, 'your sit'),
      'role', CASE WHEN s.sitter_user_id = v_uid THEN 'sitter' ELSE 'owner' END,
      'sitter_first_name', COALESCE(NULLIF(TRIM(sp.first_name), ''), 'Your Nomad'),
      'sent_today', COALESCE((d->>'sent_today')::boolean, false),
      'due_today', COALESCE((d->>'due_today')::boolean, false)
    ) ORDER BY COALESCE(l.title, s.snapshot_title))
    FROM public.conversations c
    JOIN public.sits s
      ON s.listing_id = c.listing_id
     AND s.owner_user_id = c.owner_user_id
     AND s.sitter_user_id = c.sitter_user_id
    LEFT JOIN public.listings l ON l.id = s.listing_id
    LEFT JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
    LEFT JOIN public.profiles sp ON sp.id = s.sitter_user_id
    CROSS JOIN LATERAL (SELECT public.sit_update_due(s.id) AS d) due
    WHERE c.id = ANY (p_conversation_ids)
      AND v_uid IN (c.owner_user_id, c.sitter_user_id)
      AND s.status IN ('confirmed', 'in_progress')
      AND (d->>'today')::date BETWEEN COALESCE(sd.start_date, s.snapshot_start_date)
                                  AND COALESCE(sd.end_date, s.snapshot_end_date)
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_conversation_active_sits(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_active_sits(uuid[]) TO authenticated;


-- ─── 2. Sitter's choice: name on share cards ───────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS share_name_in_stories boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.set_my_story_name_sharing(p_allow boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET share_name_in_stories = COALESCE(p_allow, true) WHERE id = auth.uid();
  RETURN COALESCE(p_allow, true);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_my_story_name_sharing(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_story_name_sharing(boolean) TO authenticated;


-- ─── 3. Sit stories ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sit_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sit_id uuid NOT NULL UNIQUE REFERENCES public.sits(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sitter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'generating', 'ready', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  title text,
  story text,
  photo_paths text[] NOT NULL DEFAULT '{}',
  rewrites_used integer NOT NULL DEFAULT 0,
  rewrite_requested_at timestamptz,
  portfolio_status text NOT NULL DEFAULT 'none' CHECK (portfolio_status IN ('none', 'requested', 'approved', 'declined', 'revoked')),
  portfolio_requested_at timestamptz,
  portfolio_decided_at timestamptz,
  portfolio_photo_paths text[] NOT NULL DEFAULT '{}' CHECK (cardinality(portfolio_photo_paths) <= 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz
);

CREATE INDEX IF NOT EXISTS sit_stories_sitter_portfolio_idx ON public.sit_stories (sitter_user_id) WHERE portfolio_status = 'approved';

ALTER TABLE public.sit_stories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sit_stories FROM anon, authenticated;
GRANT SELECT ON public.sit_stories TO authenticated;
GRANT ALL ON public.sit_stories TO service_role;

DROP POLICY IF EXISTS "Owner and sitter read their sit story" ON public.sit_stories;
CREATE POLICY "Owner and sitter read their sit story"
ON public.sit_stories FOR SELECT TO authenticated
USING (auth.uid() = owner_user_id OR auth.uid() = sitter_user_id);

DROP TRIGGER IF EXISTS update_sit_stories_updated_at ON public.sit_stories;
CREATE TRIGGER update_sit_stories_updated_at
BEFORE UPDATE ON public.sit_stories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_settings (key, value)
VALUES ('sit_story_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- ─── 4. Queueing ───────────────────────────────────────────────────────────

-- Whether a story may be generated for this sit (flag, or an admin involved).
CREATE OR REPLACE FUNCTION public.sit_story_allowed(p_owner uuid, p_sitter uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT value = 'true'::jsonb FROM public.app_settings WHERE key = 'sit_story_enabled'), false)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id IN (p_owner, p_sitter) AND is_admin IS TRUE);
$function$;

REVOKE ALL ON FUNCTION public.sit_story_allowed(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_sit_story()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_story uuid;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed'
     OR NEW.owner_user_id IS NULL OR NEW.sitter_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF (SELECT count(*) FROM public.sit_checkins WHERE sit_id = NEW.id AND kind = 'daily_update') < 2 THEN
    RETURN NULL;
  END IF;
  IF NOT public.sit_story_allowed(NEW.owner_user_id, NEW.sitter_user_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.sit_stories (sit_id, owner_user_id, sitter_user_id)
  VALUES (NEW.id, NEW.owner_user_id, NEW.sitter_user_id)
  ON CONFLICT (sit_id) DO NOTHING
  RETURNING id INTO v_story;

  IF v_story IS NOT NULL THEN
    PERFORM public.request_internal_function('sit-story', jsonb_build_object('story_id', v_story));
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never block a sit completing.
  RAISE WARNING 'queue_sit_story skipped for sit %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_sit_story() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS queue_sit_story ON public.sits;
CREATE TRIGGER queue_sit_story
AFTER UPDATE OF status ON public.sits
FOR EACH ROW EXECUTE FUNCTION public.queue_sit_story();

-- Retry once: stories still queued, failed, or stuck generating for 10+
-- minutes, with fewer than 2 attempts. (sit-story counts the attempts.)
CREATE OR REPLACE FUNCTION public.requeue_sit_stories()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.sit_stories
    WHERE status IN ('queued', 'failed', 'generating')
      AND attempts < 2
      AND updated_at < now() - interval '10 minutes'
    LIMIT 20
  LOOP
    UPDATE public.sit_stories SET status = 'queued' WHERE id = r.id;
    PERFORM public.request_internal_function('sit-story', jsonb_build_object('story_id', r.id));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.requeue_sit_stories() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sit-story-retry';
SELECT cron.schedule('sit-story-retry', '*/15 * * * *', $$SELECT public.requeue_sit_stories();$$);

-- Admin-only, for testing: (re)queue the story of a completed sit now,
-- whatever the flag (the 2-update rule still applies).
CREATE OR REPLACE FUNCTION public.admin_queue_sit_story(p_sit_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  v_story uuid;
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
  END IF;
  SELECT id, status, owner_user_id, sitter_user_id INTO s FROM public.sits WHERE id = p_sit_id;
  IF NOT FOUND OR s.status <> 'completed' THEN
    RAISE EXCEPTION 'That sit isn''t completed.';
  END IF;
  IF s.owner_user_id IS NULL OR s.sitter_user_id IS NULL THEN
    RAISE EXCEPTION 'A member of this sit has left.';
  END IF;
  IF (SELECT count(*) FROM public.sit_checkins WHERE sit_id = p_sit_id AND kind = 'daily_update') < 2 THEN
    RAISE EXCEPTION 'A Sit Story needs at least 2 daily updates.';
  END IF;

  INSERT INTO public.sit_stories (sit_id, owner_user_id, sitter_user_id)
  VALUES (p_sit_id, s.owner_user_id, s.sitter_user_id)
  ON CONFLICT (sit_id) DO UPDATE SET status = 'queued', attempts = 0
  RETURNING id INTO v_story;

  PERFORM public.request_internal_function('sit-story', jsonb_build_object('story_id', v_story));
  RETURN v_story;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_queue_sit_story(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_queue_sit_story(uuid) TO authenticated;


-- ─── 5. The story page and its actions ─────────────────────────────────────

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
  v_end date;
  v_reviewed boolean;
BEGIN
  SELECT ss.*, si.listing_id, l.city, COALESCE(sd.end_date, si.snapshot_end_date) AS end_date,
         COALESCE(l.city, si.snapshot_city) AS place
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

  RETURN jsonb_build_object(
    'id', st.id,
    'sit_id', st.sit_id,
    'status', st.status,
    'role', CASE WHEN v_uid = st.owner_user_id THEN 'owner' ELSE 'sitter' END,
    'title', st.title,
    'story', CASE WHEN st.status = 'ready' OR st.story IS NOT NULL THEN st.story END,
    'photo_paths', to_jsonb(st.photo_paths),
    'city', st.place,
    'owner_user_id', st.owner_user_id,
    'sitter_user_id', st.sitter_user_id,
    'owner_first_name', CASE WHEN st.owner_user_id IS NULL THEN 'Former member'
      ELSE (SELECT COALESCE(NULLIF(TRIM(first_name), ''), 'your Pet Parent') FROM public.profiles WHERE id = st.owner_user_id) END,
    'sitter_first_name', CASE WHEN st.sitter_user_id IS NULL THEN 'Former member'
      ELSE (SELECT COALESCE(NULLIF(TRIM(first_name), ''), 'your Nomad') FROM public.profiles WHERE id = st.sitter_user_id) END,
    -- Share cards use the sitter's name only if they allow it.
    'sitter_share_name', CASE WHEN st.sitter_user_id IS NULL THEN NULL
      ELSE (SELECT CASE WHEN share_name_in_stories THEN COALESCE(NULLIF(TRIM(first_name), ''), NULL) END
            FROM public.profiles WHERE id = st.sitter_user_id) END,
    'can_review', v_uid = st.owner_user_id AND st.sitter_user_id IS NOT NULL AND NOT v_reviewed
                  AND st.end_date IS NOT NULL AND current_date <= st.end_date + 14,
    'can_rewrite', v_uid = st.owner_user_id AND st.status = 'ready' AND st.rewrites_used = 0,
    'rewriting', st.rewrite_requested_at IS NOT NULL AND st.status IN ('queued', 'generating'),
    'portfolio_status', st.portfolio_status,
    'portfolio_photo_paths', to_jsonb(st.portfolio_photo_paths)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_sit_story(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sit_story(uuid) TO authenticated;

-- "Write it again": once per story, owner only. The current text stays until
-- the new one is ready; if it fails, the rewrite is given back.
CREATE OR REPLACE FUNCTION public.request_sit_story_rewrite(p_story_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  st record;
BEGIN
  SELECT * INTO st FROM public.sit_stories WHERE id = p_story_id FOR UPDATE;
  IF NOT FOUND OR st.owner_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Story not found.' USING ERRCODE = '42501';
  END IF;
  IF st.status <> 'ready' OR st.rewrites_used > 0 THEN
    RAISE EXCEPTION 'This story can''t be written again.';
  END IF;
  UPDATE public.sit_stories
  SET rewrites_used = 1, rewrite_requested_at = now(), status = 'queued', attempts = 0
  WHERE id = p_story_id;
  PERFORM public.request_internal_function('sit-story', jsonb_build_object('story_id', p_story_id));
END;
$function$;

REVOKE ALL ON FUNCTION public.request_sit_story_rewrite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_sit_story_rewrite(uuid) TO authenticated;

-- Sitter: ask to show the story on their profile (or withdraw the request /
-- remove it themselves).
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

  UPDATE public.sit_stories SET portfolio_status = 'none', portfolio_photo_paths = '{}' WHERE id = p_story_id;
  RETURN 'none';
END;
$function$;

REVOKE ALL ON FUNCTION public.set_sit_story_portfolio_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_sit_story_portfolio_request(uuid, boolean) TO authenticated;

-- Owner: approve (with up to 2 of the story's photos), decline, or revoke.
CREATE OR REPLACE FUNCTION public.decide_sit_story_portfolio(p_story_id uuid, p_decision text, p_photo_paths text[] DEFAULT '{}')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  st record;
  v_paths text[] := COALESCE(p_photo_paths, '{}');
BEGIN
  SELECT * INTO st FROM public.sit_stories WHERE id = p_story_id FOR UPDATE;
  IF NOT FOUND OR st.owner_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Story not found.' USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'approve' THEN
    IF st.portfolio_status NOT IN ('requested', 'approved') OR st.sitter_user_id IS NULL THEN
      RAISE EXCEPTION 'There''s no request to approve.';
    END IF;
    IF cardinality(v_paths) > 2 OR NOT (v_paths <@ st.photo_paths) THEN
      RAISE EXCEPTION 'Choose up to 2 photos from this story.';
    END IF;
    UPDATE public.sit_stories
    SET portfolio_status = 'approved', portfolio_photo_paths = v_paths, portfolio_decided_at = now()
    WHERE id = p_story_id;
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (st.sitter_user_id, 'sit_story_portfolio_decision', 'Your Sit Story is on your profile',
            'The Pet Parent approved it for your NomadNest profile.',
            jsonb_build_object('url', '/stories/' || p_story_id::text, 'story_id', p_story_id::text));
    RETURN 'approved';
  ELSIF p_decision = 'decline' THEN
    IF st.portfolio_status <> 'requested' THEN
      RAISE EXCEPTION 'There''s no request to decline.';
    END IF;
    UPDATE public.sit_stories SET portfolio_status = 'declined', portfolio_photo_paths = '{}', portfolio_decided_at = now()
    WHERE id = p_story_id;
    RETURN 'declined';
  ELSIF p_decision = 'revoke' THEN
    UPDATE public.sit_stories SET portfolio_status = 'revoked', portfolio_photo_paths = '{}', portfolio_decided_at = now()
    WHERE id = p_story_id;
    RETURN 'revoked';
  END IF;
  RAISE EXCEPTION 'Invalid decision.';
END;
$function$;

REVOKE ALL ON FUNCTION public.decide_sit_story_portfolio(uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_sit_story_portfolio(uuid, text, text[]) TO authenticated;

-- A sitter's approved stories, for their profile (members only).
CREATE OR REPLACE FUNCTION public.get_sitter_portfolio(p_sitter_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ss.id,
    'title', ss.title,
    'excerpt', left(ss.story, 220),
    'city', COALESCE(l.city, si.snapshot_city),
    'photo_paths', to_jsonb(ss.portfolio_photo_paths),
    'ready_at', ss.ready_at
  ) ORDER BY ss.ready_at DESC), '[]'::jsonb)
  FROM public.sit_stories ss
  JOIN public.sits si ON si.id = ss.sit_id
  LEFT JOIN public.listings l ON l.id = si.listing_id
  WHERE auth.uid() IS NOT NULL
    AND ss.sitter_user_id = p_sitter_id
    AND ss.portfolio_status = 'approved'
    AND ss.status = 'ready';
$function$;

REVOKE ALL ON FUNCTION public.get_sitter_portfolio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sitter_portfolio(uuid) TO authenticated;


-- ─── 6. Update photos: + approved portfolio photos ─────────────────────────

CREATE OR REPLACE FUNCTION public.can_read_sit_update_photo(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.sits s
    WHERE s.id = public.sit_update_photo_sit(p_name)
      AND (s.sitter_user_id = auth.uid() OR s.owner_user_id = auth.uid())
  )
  OR (
    -- Any signed-in member, but only for a photo the owner approved for the
    -- sitter's profile, while that approval stands.
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.sit_stories ss
      WHERE ss.portfolio_status = 'approved'
        AND ss.status = 'ready'
        AND p_name = ANY (ss.portfolio_photo_paths)
    )
  );
$function$;


-- ─── 7. Quiet sitter notification, deletion ────────────────────────────────

CREATE OR REPLACE FUNCTION public.push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  -- Quiet, in-app only notifications.
  IF NEW.type IN ('sit_update_loved', 'sit_story_ready_sitter') THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_trigger_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'internal_trigger_secret missing from vault; push skipped';
    RETURN NEW;
  END IF;

  -- pg_net queues the request and sends it after this transaction commits,
  -- so the function always finds the committed row.
  PERFORM net.http_post(
    url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body    := jsonb_build_object('notification_id', NEW.id::text)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to queue push for notification %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.push_on_notification_insert() FROM PUBLIC, anon, authenticated;

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

  -- Sit Stories: a story stays with its sit for the other member, but any
  -- portfolio approval ends, and a departing sitter's photos (deleted with
  -- their files) leave the story.
  UPDATE public.sit_stories
  SET portfolio_status = 'none', portfolio_photo_paths = '{}'
  WHERE owner_user_id = p_user_id OR sitter_user_id = p_user_id;
  UPDATE public.sit_stories SET photo_paths = '{}' WHERE sitter_user_id = p_user_id;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('preferred_language', p.preferred_language,
                            'share_name_in_stories', p.share_name_in_stories)
  FROM public.profiles p
  WHERE p.id = auth.uid() AND auth.uid() IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_my_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_settings() TO authenticated;
