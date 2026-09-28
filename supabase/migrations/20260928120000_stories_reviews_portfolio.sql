-- Review notifications from the database, the sitter's story notification
-- pushes, "Write it again" removed, and the Sit Story portfolio rules.
--
-- 1. A new review notifies the reviewee from the database (in-app row, push
--    and email through send-notification-email), not from the browser.
-- 2. sit_story_ready_sitter is a normal notification with push.
-- 3. "Write it again" is gone: its function, fields and columns. Existing
--    stories keep their text.
-- 4. Portfolio: once approved, the owner can't remove the story or pick new
--    photos, only remove photos (remove_sit_story_portfolio_photo). The Nomad
--    can still remove the whole story and ask again. get_portfolio_story()
--    gives any signed-in member the read-only approved story.


-- ─── 1. Review notifications ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_review_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sit record;
  v_reviewer text;
  v_url text;
BEGIN
  IF NEW.reviewee_user_id IS NULL OR NEW.reviewer_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT owner_user_id, sitter_user_id INTO v_sit FROM public.sits WHERE id = NEW.sit_id;
  SELECT NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(first_name), ''), NULLIF(TRIM(last_name), ''))), '')
    INTO v_reviewer
  FROM public.profiles WHERE id = NEW.reviewer_user_id;

  -- The reviewee's own reviews page: the Nomad's when the Pet Parent reviewed.
  v_url := CASE WHEN NEW.reviewee_user_id = v_sit.sitter_user_id
                THEN '/sitter/' || NEW.reviewee_user_id::text || '/reviews'
                ELSE '/owner/' || NEW.reviewee_user_id::text || '/reviews' END;

  -- send-notification-email creates the in-app row (which pushes) and the email.
  PERFORM public.request_internal_function('send-notification-email', jsonb_build_object(
    'type', 'review',
    'recipientUserId', NEW.reviewee_user_id::text,
    'data', jsonb_build_object(
      'reviewerName', COALESCE(v_reviewer, 'Someone'),
      'rating', NEW.rating::text,
      'text', left(COALESCE(TRIM(NEW.text), ''), 500),
      'url', v_url,
      'sit_id', NEW.sit_id::text
    )
  ));
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block the review itself.
    RAISE WARNING 'Review notification not queued for review %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_review_received() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_review_received ON public.reviews;
CREATE TRIGGER notify_review_received
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.notify_review_received();


-- ─── 2. Sitter's "story is ready" pushes like any notification ──────────────

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
  IF NEW.type IN ('sit_update_loved') THEN
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


-- ─── 3. "Write it again" removed ────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.request_sit_story_rewrite(uuid);

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
BEGIN
  SELECT ss.*, si.listing_id, COALESCE(sd.end_date, si.snapshot_end_date) AS end_date,
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
    'portfolio_status', st.portfolio_status,
    'portfolio_photo_paths', to_jsonb(st.portfolio_photo_paths)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_sit_story(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sit_story(uuid) TO authenticated;

ALTER TABLE public.sit_stories DROP COLUMN IF EXISTS rewrites_used;
ALTER TABLE public.sit_stories DROP COLUMN IF EXISTS rewrite_requested_at;


-- ─── 4. Portfolio rules ─────────────────────────────────────────────────────

-- Owner: approve a request (with up to 2 of the story's photos) or decline
-- it. After approval the story stays; only photos can be removed.
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
    IF st.portfolio_status <> 'requested' OR st.sitter_user_id IS NULL THEN
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
  END IF;
  RAISE EXCEPTION 'Invalid decision.';
END;
$function$;

REVOKE ALL ON FUNCTION public.decide_sit_story_portfolio(uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_sit_story_portfolio(uuid, text, text[]) TO authenticated;

-- Owner: remove one photo from an approved story on the Nomad's profile.
-- Read access follows portfolio_photo_paths, so it ends at once.
CREATE OR REPLACE FUNCTION public.remove_sit_story_portfolio_photo(p_story_id uuid, p_path text)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  st record;
  v_paths text[];
BEGIN
  SELECT * INTO st FROM public.sit_stories WHERE id = p_story_id FOR UPDATE;
  IF NOT FOUND OR st.owner_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Story not found.' USING ERRCODE = '42501';
  END IF;
  IF st.portfolio_status <> 'approved' THEN
    RAISE EXCEPTION 'This story isn''t on their profile.';
  END IF;
  IF p_path IS NULL OR NOT (p_path = ANY (st.portfolio_photo_paths)) THEN
    RAISE EXCEPTION 'That photo isn''t on their profile.';
  END IF;

  v_paths := array_remove(st.portfolio_photo_paths, p_path);
  UPDATE public.sit_stories SET portfolio_photo_paths = v_paths WHERE id = p_story_id;
  RETURN v_paths;
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_sit_story_portfolio_photo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_sit_story_portfolio_photo(uuid, text) TO authenticated;

-- Any signed-in member: an approved story as it appears on the Nomad's
-- profile (title, full text, approved photos). Nothing else.
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
