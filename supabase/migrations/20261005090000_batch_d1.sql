-- Batch D1: Messages, Share my number, City Chats, Notifications.
--
-- 1. get_conversation_partners(): one row per conversation you are in, with
--    the other member's first name, avatar, ID tick and member-left state
--    (whatever their visibility), the listing, the most relevant sit,
--    application and invite, the last message and your unread count.
--    First names only. Replaces the per-chat public_profiles look-ups, which
--    hid chats with hidden or paused members.
-- 2. mark_conversation_notifications_read(ids): opening a chat also marks its
--    new_message and phone_shared notifications read.
-- 3. Share my number: phone_shares (no direct access for members), the RPCs
--    share_my_phone, stop_sharing_my_phone and get_phone_shares, and a
--    trigger that ends shares when a sit between the two is cancelled. The
--    number is never written into a message or notification: the chat gets a
--    marker message ([[phone_share]] with no number) and the card reads the
--    number through get_phone_shares.
-- 4. City Chats: access matches city AND country (the room's city_key),
--    get_my_city_chat_rooms() (rooms you can see, locked cities, counts,
--    unread) in one call, city_chat_mutes (own rows; muted rooms send no push
--    for thread replies), city_chat_room_reads (own rows) with
--    mark_city_chat_room_read, and get_city_chat_catchup_input for the
--    "Catch me up" edge function (members with access only, text only).
-- 5. Reports: city_chat_message target type; admin_list_reports shows the
--    reported message text and the sender's first name for message reports.
-- 6. Flag ai_city_catchup_enabled (off).
-- 7. Translation queue skips phone-share markers.
-- 8. scrub_contact_details re-stated exactly as in our Batch C file
--    (Lovable's second copy, 20261002021257, had one character class differ).

-- ─── 1. Conversation partners ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_conversation_partners()
RETURNS TABLE (
  conversation_id uuid,
  other_user_id uuid,
  first_name text,
  avatar_url text,
  id_verified boolean,
  member_left boolean,
  listing_id uuid,
  listing_title text,
  listing_city text,
  sit_id uuid,
  sit_status text,
  sit_start date,
  sit_end date,
  application_status text,
  invite_status text,
  last_body text,
  last_at timestamptz,
  last_sender uuid,
  unread_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  convs AS (
    SELECT c.id, c.listing_id, c.owner_user_id, c.sitter_user_id, c.updated_at,
           CASE WHEN c.owner_user_id = me.uid THEN c.sitter_user_id ELSE c.owner_user_id END AS other_id,
           me.uid
    FROM public.conversations c, me
    WHERE me.uid IS NOT NULL
      AND (c.owner_user_id = me.uid OR c.sitter_user_id = me.uid)
  )
  SELECT
    c.id,
    c.other_id,
    CASE WHEN c.other_id IS NULL OR p.id IS NULL THEN 'Former member'
         ELSE COALESCE(NULLIF(btrim(p.first_name), ''), 'Member') END,
    CASE WHEN c.other_id IS NULL THEN NULL ELSE p.avatar_url END,
    c.other_id IS NOT NULL AND COALESCE(p.id_verified, false),
    c.other_id IS NULL OR p.id IS NULL,
    l.id,
    l.title,
    l.city,
    s.id,
    s.status::text,
    s.start_date,
    s.end_date,
    a.status::text,
    i.status,
    lm.body,
    lm.created_at,
    lm.sender_user_id,
    (SELECT count(*)::integer FROM public.messages m
      WHERE m.conversation_id = c.id AND m.read_at IS NULL AND m.sender_user_id <> c.uid)
  FROM convs c
  LEFT JOIN public.profiles p ON p.id = c.other_id
  LEFT JOIN public.listings l ON l.id = c.listing_id
  LEFT JOIN LATERAL (
    SELECT si.id, si.status,
           COALESCE(sd.start_date, si.snapshot_start_date) AS start_date,
           COALESCE(sd.end_date, si.snapshot_end_date) AS end_date
    FROM public.sits si
    LEFT JOIN public.sit_dates sd ON sd.id = si.sit_dates_id
    WHERE c.listing_id IS NOT NULL
      AND si.listing_id = c.listing_id
      AND c.other_id IS NOT NULL
      AND ((si.owner_user_id = c.uid AND si.sitter_user_id = c.other_id)
        OR (si.owner_user_id = c.other_id AND si.sitter_user_id = c.uid))
    ORDER BY (si.status IN ('confirmed', 'in_progress')) DESC,
             (si.status <> 'cancelled') DESC,
             COALESCE(sd.end_date, si.snapshot_end_date) DESC NULLS LAST,
             si.created_at DESC
    LIMIT 1
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT ap.status FROM public.applications ap
    WHERE c.listing_id IS NOT NULL AND ap.listing_id = c.listing_id AND ap.sitter_user_id = c.sitter_user_id
    ORDER BY ap.created_at DESC LIMIT 1
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT iv.status FROM public.sitter_invites iv
    WHERE c.listing_id IS NOT NULL AND iv.listing_id = c.listing_id AND iv.sitter_user_id = c.sitter_user_id
    ORDER BY iv.created_at DESC LIMIT 1
  ) i ON true
  LEFT JOIN LATERAL (
    SELECT m.body, m.created_at, m.sender_user_id FROM public.messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true;
$$;

REVOKE ALL ON FUNCTION public.get_conversation_partners() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_partners() TO authenticated;


-- ─── 2. Opening a chat clears its bell notifications ───────────────────────

CREATE OR REPLACE FUNCTION public.mark_conversation_notifications_read(p_conversation_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids text[];
  v_n integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Only conversations you are in.
  SELECT array_agg(c.id::text) INTO v_ids
  FROM public.conversations c
  WHERE c.id = ANY (COALESCE(p_conversation_ids, '{}'))
    AND (c.owner_user_id = v_uid OR c.sitter_user_id = v_uid);
  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.notifications n
  SET read_at = now()
  WHERE n.user_id = v_uid
    AND n.read_at IS NULL
    AND n.type IN ('new_message', 'phone_shared')
    AND (n.data->>'conversation_id' = ANY (v_ids) OR n.data->>'conversationId' = ANY (v_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_notifications_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_notifications_read(uuid[]) TO authenticated;


-- ─── 3. Share my number ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.phone_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sharer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sit_id uuid REFERENCES public.sits(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  CHECK (sharer_id <> recipient_id)
);

-- At most one active share from one member to another.
CREATE UNIQUE INDEX IF NOT EXISTS phone_shares_one_active
  ON public.phone_shares (sharer_id, recipient_id) WHERE stopped_at IS NULL;
CREATE INDEX IF NOT EXISTS phone_shares_recipient ON public.phone_shares (recipient_id);

-- RLS on with no policies, and no table privileges: members only reach it
-- through the RPCs below.
ALTER TABLE public.phone_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.phone_shares FROM PUBLIC, anon, authenticated;

-- A confirmed or in-progress sit between the two members (either way round).
CREATE OR REPLACE FUNCTION public.live_sit_between(p_a uuid, p_b uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id FROM public.sits s
  WHERE s.status IN ('confirmed', 'in_progress')
    AND ((s.owner_user_id = p_a AND s.sitter_user_id = p_b)
      OR (s.owner_user_id = p_b AND s.sitter_user_id = p_a))
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.live_sit_between(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- The chat the share card goes into: the sit's listing chat, else the most
-- recent chat between the two.
CREATE OR REPLACE FUNCTION public.phone_share_conversation(p_a uuid, p_b uuid, p_sit uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id FROM public.conversations c
  WHERE (c.owner_user_id = p_a AND c.sitter_user_id = p_b)
     OR (c.owner_user_id = p_b AND c.sitter_user_id = p_a)
  ORDER BY (c.listing_id IS NOT DISTINCT FROM (SELECT s.listing_id FROM public.sits s WHERE s.id = p_sit)) DESC,
           c.updated_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.phone_share_conversation(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.share_my_phone(p_other_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sit uuid;
  v_conv uuid;
  v_verified boolean;
  v_number text;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_other_user IS NULL OR p_other_user = v_uid THEN
    RAISE EXCEPTION 'Choose who to share with' USING ERRCODE = '22023';
  END IF;

  v_sit := public.live_sit_between(v_uid, p_other_user);
  IF v_sit IS NULL THEN
    RAISE EXCEPTION 'no_confirmed_sit' USING ERRCODE = 'insufficient_privilege',
      HINT = 'You can share your number once a sit between you is confirmed.';
  END IF;

  SELECT p.phone_verified, NULLIF(btrim(p.phone_number), ''), COALESCE(NULLIF(btrim(p.first_name), ''), 'A member')
  INTO v_verified, v_number, v_name
  FROM public.profiles p WHERE p.id = v_uid;
  IF NOT COALESCE(v_verified, false) OR v_number IS NULL THEN
    RAISE EXCEPTION 'no_verified_phone' USING ERRCODE = 'insufficient_privilege',
      HINT = 'Add a verified phone number first.';
  END IF;

  v_conv := public.phone_share_conversation(v_uid, p_other_user, v_sit);
  IF v_conv IS NULL THEN
    RAISE EXCEPTION 'no_conversation' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Already sharing: nothing to do.
  IF EXISTS (SELECT 1 FROM public.phone_shares ps
             WHERE ps.sharer_id = v_uid AND ps.recipient_id = p_other_user AND ps.stopped_at IS NULL) THEN
    RETURN jsonb_build_object('sharing', true, 'conversation_id', v_conv);
  END IF;

  INSERT INTO public.phone_shares (sharer_id, recipient_id, sit_id)
  VALUES (v_uid, p_other_user, v_sit);

  -- A marker so the card shows at the right place in the chat. No number.
  INSERT INTO public.messages (conversation_id, sender_user_id, body)
  VALUES (v_conv, v_uid, '[[phone_share]]{"action":"shared"}');

  -- In-app notification (the push follows from it). No number, no email.
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    p_other_user,
    'phone_shared',
    v_name || ' shared their phone number with you',
    'Open your chat to see it. Only you can see it.',
    jsonb_build_object('url', '/inbox?conversation=' || v_conv::text, 'conversation_id', v_conv::text)
  );

  RETURN jsonb_build_object('sharing', true, 'conversation_id', v_conv);
END;
$$;

REVOKE ALL ON FUNCTION public.share_my_phone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_my_phone(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.stop_sharing_my_phone(p_other_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n integer;
  v_conv uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.phone_shares
  SET stopped_at = now()
  WHERE sharer_id = v_uid AND recipient_id = p_other_user AND stopped_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n > 0 THEN
    v_conv := public.phone_share_conversation(v_uid, p_other_user, public.live_sit_between(v_uid, p_other_user));
    IF v_conv IS NOT NULL THEN
      INSERT INTO public.messages (conversation_id, sender_user_id, body)
      VALUES (v_conv, v_uid, '[[phone_share]]{"action":"stopped"}');
    END IF;
  END IF;

  RETURN jsonb_build_object('sharing', false, 'stopped', v_n > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.stop_sharing_my_phone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stop_sharing_my_phone(uuid) TO authenticated;

-- My share status with this member, my own number (for the confirm sheet),
-- and THEIR number only while they actively share it with me.
CREATE OR REPLACE FUNCTION public.get_phone_shares(p_other_user uuid)
RETURNS TABLE (
  can_share boolean,
  my_phone_verified boolean,
  my_number text,
  i_am_sharing boolean,
  they_are_sharing boolean,
  their_number text,
  their_first_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_their boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Only someone you share a conversation with.
  IF p_other_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE (c.owner_user_id = v_uid AND c.sitter_user_id = p_other_user)
       OR (c.owner_user_id = p_other_user AND c.sitter_user_id = v_uid)
  ) THEN
    RETURN;
  END IF;

  v_their := EXISTS (SELECT 1 FROM public.phone_shares ps
                     WHERE ps.sharer_id = p_other_user AND ps.recipient_id = v_uid AND ps.stopped_at IS NULL);

  RETURN QUERY
  SELECT
    public.live_sit_between(v_uid, p_other_user) IS NOT NULL,
    COALESCE(me.phone_verified, false) AND NULLIF(btrim(me.phone_number), '') IS NOT NULL,
    CASE WHEN COALESCE(me.phone_verified, false) THEN NULLIF(btrim(me.phone_number), '') END,
    EXISTS (SELECT 1 FROM public.phone_shares ps
            WHERE ps.sharer_id = v_uid AND ps.recipient_id = p_other_user AND ps.stopped_at IS NULL),
    v_their AND COALESCE(them.phone_verified, false) AND NULLIF(btrim(them.phone_number), '') IS NOT NULL,
    CASE WHEN v_their AND COALESCE(them.phone_verified, false) THEN NULLIF(btrim(them.phone_number), '') END,
    COALESCE(NULLIF(btrim(them.first_name), ''), 'Member')
  FROM public.profiles me
  LEFT JOIN public.profiles them ON them.id = p_other_user
  WHERE me.id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.get_phone_shares(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_phone_shares(uuid) TO authenticated;

-- A cancelled sit ends the share automatically (unless another live sit
-- between the same two members remains).
CREATE OR REPLACE FUNCTION public.end_phone_shares_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share record;
  v_conv uuid;
BEGIN
  IF NEW.owner_user_id IS NULL OR NEW.sitter_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.live_sit_between(NEW.owner_user_id, NEW.sitter_user_id) IS NOT NULL THEN
    RETURN NEW;
  END IF;

  FOR v_share IN
    UPDATE public.phone_shares
    SET stopped_at = now()
    WHERE stopped_at IS NULL
      AND ((sharer_id = NEW.owner_user_id AND recipient_id = NEW.sitter_user_id)
        OR (sharer_id = NEW.sitter_user_id AND recipient_id = NEW.owner_user_id))
    RETURNING sharer_id, recipient_id
  LOOP
    v_conv := public.phone_share_conversation(v_share.sharer_id, v_share.recipient_id, NEW.id);
    IF v_conv IS NOT NULL THEN
      INSERT INTO public.messages (conversation_id, sender_user_id, body)
      VALUES (v_conv, v_share.sharer_id, '[[phone_share]]{"action":"ended"}');
    END IF;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block a cancellation; the share check below still hides numbers
  -- only while a share row is active, so log and carry on.
  RAISE WARNING 'end_phone_shares_on_cancel failed for sit %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.end_phone_shares_on_cancel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS end_phone_shares_on_cancel ON public.sits;
CREATE TRIGGER end_phone_shares_on_cancel
AFTER UPDATE OF status ON public.sits
FOR EACH ROW
WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.end_phone_shares_on_cancel();


-- ─── 4. City Chats ─────────────────────────────────────────────────────────

-- Access: a confirmed or in-progress sit, not yet ended, at a listing in the
-- room's city AND country (the room's city_key).
CREATE OR REPLACE FUNCTION public.can_access_city_chat(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.city_chat_rooms r
    JOIN public.listings l ON public.city_chat_key(l.city, l.country) = r.city_key
    JOIN public.sits s ON s.listing_id = l.id
    JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
    WHERE r.id = p_room_id
      AND p_user_id IS NOT NULL
      AND s.sitter_user_id = p_user_id
      AND s.status IN ('confirmed', 'in_progress')
      AND sd.end_date >= CURRENT_DATE
  );
$$;

CREATE OR REPLACE FUNCTION public.city_chat_nomad_count(p_room_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT s.sitter_user_id)::integer
  FROM public.city_chat_rooms r
  JOIN public.listings l ON public.city_chat_key(l.city, l.country) = r.city_key
  JOIN public.sits s ON s.listing_id = l.id
  JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
  WHERE r.id = p_room_id
    AND s.status IN ('confirmed', 'in_progress')
    AND sd.end_date >= CURRENT_DATE;
$$;

CREATE TABLE IF NOT EXISTS public.city_chat_mutes (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.city_chat_rooms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id)
);
ALTER TABLE public.city_chat_mutes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.city_chat_mutes FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.city_chat_mutes TO authenticated;

DROP POLICY IF EXISTS "Members see their own mutes" ON public.city_chat_mutes;
CREATE POLICY "Members see their own mutes" ON public.city_chat_mutes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Members add their own mutes" ON public.city_chat_mutes;
CREATE POLICY "Members add their own mutes" ON public.city_chat_mutes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Members remove their own mutes" ON public.city_chat_mutes;
CREATE POLICY "Members remove their own mutes" ON public.city_chat_mutes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.city_chat_room_reads (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.city_chat_rooms(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id)
);
ALTER TABLE public.city_chat_room_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.city_chat_room_reads FROM PUBLIC, anon;
GRANT SELECT ON public.city_chat_room_reads TO authenticated;

DROP POLICY IF EXISTS "Members see their own room reads" ON public.city_chat_room_reads;
CREATE POLICY "Members see their own room reads" ON public.city_chat_room_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Opening a room: remember when (members with access only). Returns the
-- previous time, so "Catch me up" can cover what was new.
CREATE OR REPLACE FUNCTION public.mark_city_chat_room_read(p_room_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev timestamptz;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_city_chat(p_room_id, v_uid) THEN
    RAISE EXCEPTION 'No access to this city chat' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT last_read_at INTO v_prev FROM public.city_chat_room_reads WHERE user_id = v_uid AND room_id = p_room_id;
  INSERT INTO public.city_chat_room_reads (user_id, room_id, last_read_at)
  VALUES (v_uid, p_room_id, now())
  ON CONFLICT (user_id, room_id) DO UPDATE SET last_read_at = now();
  RETURN v_prev;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_city_chat_room_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_city_chat_room_read(uuid) TO authenticated;

-- Rooms you can open, plus locked cities where you have an open application
-- or invitation. One call (no per-room look-ups).
CREATE OR REPLACE FUNCTION public.get_my_city_chat_rooms()
RETURNS TABLE (
  room_id uuid,
  city text,
  country text,
  city_key text,
  has_access boolean,
  sit_start date,
  sit_end date,
  nomad_count integer,
  unread_count integer,
  last_read_at timestamptz,
  muted boolean,
  locked_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  mine AS (
    -- My live sits, by city key.
    SELECT public.city_chat_key(l.city, l.country) AS key, min(sd.start_date) AS s, max(sd.end_date) AS e
    FROM me
    JOIN public.sits s ON s.sitter_user_id = me.uid
    JOIN public.listings l ON l.id = s.listing_id
    JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
    WHERE s.status IN ('confirmed', 'in_progress') AND sd.end_date >= CURRENT_DATE
    GROUP BY 1
  ),
  open_rooms AS (
    SELECT r.id, r.city, r.country, r.city_key, m.s, m.e
    FROM public.city_chat_rooms r JOIN mine m ON m.key = r.city_key
  ),
  pending AS (
    -- Open applications and pending invitations in cities I can't open yet.
    SELECT DISTINCT ON (k.key) k.key, k.city, k.country, k.reason, k.s, k.e
    FROM (
      SELECT public.city_chat_key(l.city, l.country) AS key, btrim(l.city) AS city, btrim(l.country) AS country,
             'applied'::text AS reason, sd.start_date AS s, sd.end_date AS e
      FROM me
      JOIN public.applications a ON a.sitter_user_id = me.uid AND a.status IN ('applied', 'shortlisted')
      JOIN public.listings l ON l.id = a.listing_id
      LEFT JOIN public.sit_dates sd ON sd.id = a.sit_dates_id
      WHERE COALESCE(sd.end_date, CURRENT_DATE) >= CURRENT_DATE
      UNION ALL
      SELECT public.city_chat_key(l.city, l.country), btrim(l.city), btrim(l.country),
             'invited', sd.start_date, sd.end_date
      FROM me
      JOIN public.sitter_invites i ON i.sitter_user_id = me.uid AND i.status = 'pending'
      JOIN public.listings l ON l.id = i.listing_id
      LEFT JOIN public.sit_dates sd ON sd.id = i.sit_dates_id
      WHERE COALESCE(sd.end_date, CURRENT_DATE) >= CURRENT_DATE
    ) k
    WHERE NULLIF(k.city, '') IS NOT NULL AND NULLIF(k.country, '') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM mine m WHERE m.key = k.key)
    ORDER BY k.key, k.s NULLS LAST
  )
  SELECT o.id, o.city, o.country, o.city_key, true, o.s, o.e,
         public.city_chat_nomad_count(o.id),
         (SELECT count(*)::integer FROM public.city_chat_messages cm, me
           WHERE cm.room_id = o.id AND cm.sender_user_id <> me.uid AND NOT cm.is_pinned
             AND cm.created_at > COALESCE(rr.last_read_at, now() - interval '7 days')),
         rr.last_read_at,
         EXISTS (SELECT 1 FROM public.city_chat_mutes mu, me WHERE mu.user_id = me.uid AND mu.room_id = o.id),
         NULL::text
  FROM open_rooms o
  LEFT JOIN public.city_chat_room_reads rr ON rr.room_id = o.id AND rr.user_id = (SELECT uid FROM me)
  UNION ALL
  SELECT r.id, p.city, p.country, p.key, false, p.s, p.e, NULL::integer, 0, NULL::timestamptz, false, p.reason
  FROM pending p
  LEFT JOIN public.city_chat_rooms r ON r.city_key = p.key;
$$;

REVOKE ALL ON FUNCTION public.get_my_city_chat_rooms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_city_chat_rooms() TO authenticated;

-- "Catch me up": the room's recent message text for the edge function, as
-- the member (their JWT), so only members with access get anything. At most
-- the last 3 days and 200 messages since p_since. Sender first names come
-- back only so the function can replace them with "a Nomad"; they are never
-- sent to the AI.
CREATE OR REPLACE FUNCTION public.get_city_chat_catchup_input(p_room_id uuid, p_since timestamptz)
RETURNS TABLE (content text, sender_name text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_since timestamptz := GREATEST(COALESCE(p_since, now() - interval '3 days'), now() - interval '3 days');
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_city_chat(p_room_id, v_uid) THEN
    RAISE EXCEPTION 'No access to this city chat' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT x.content, x.sender_name, x.created_at FROM (
    SELECT cm.content, COALESCE(NULLIF(btrim(p.first_name), ''), '') AS sender_name, cm.created_at
    FROM public.city_chat_messages cm
    LEFT JOIN public.profiles p ON p.id = cm.sender_user_id
    WHERE cm.room_id = p_room_id AND NOT cm.is_pinned AND cm.created_at > v_since
    ORDER BY cm.created_at DESC
    LIMIT 200
  ) x
  ORDER BY x.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_city_chat_catchup_input(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_city_chat_catchup_input(uuid, timestamptz) TO authenticated;

-- Muted rooms: the in-app row still appears, but no push for thread replies.
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

  -- City chat replies in a room the member muted.
  IF NEW.type = 'city_chat_thread_reply' AND EXISTS (
    SELECT 1 FROM public.city_chat_mutes mu
    WHERE mu.user_id = NEW.user_id AND mu.room_id::text = NEW.data->>'room_id'
  ) THEN
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


-- ─── 5. Reports ────────────────────────────────────────────────────────────

ALTER TYPE public.report_target_type ADD VALUE IF NOT EXISTS 'city_chat_message';

-- The new enum value can't be used as a literal in this transaction, so the
-- function compares target_type as text.
DROP FUNCTION IF EXISTS public.admin_list_reports();
CREATE OR REPLACE FUNCTION public.admin_list_reports()
RETURNS TABLE (
  id uuid,
  reporter_user_id uuid,
  reporter_name text,
  reporter_email text,
  target_type report_target_type,
  target_id uuid,
  reason text,
  details text,
  status report_status,
  created_at timestamptz,
  updated_at timestamptz,
  target_name text,
  target_email text,
  target_profile_user_id uuid,
  evidence_paths text[],
  reported_message text,
  reported_sender_first_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id,
         r.reporter_user_id,
         nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '') AS reporter_name,
         p.email AS reporter_email,
         r.target_type,
         r.target_id,
         r.reason,
         r.details,
         r.status,
         r.created_at,
         r.updated_at,
         coalesce(
           tp.full_name,
           nullif(trim(coalesce(tp.first_name,'') || ' ' || coalesce(tp.last_name,'')), ''),
           tp.email
         ) AS target_name,
         tp.email AS target_email,
         tp.id AS target_profile_user_id,
         r.evidence_paths,
         CASE r.target_type::text
           WHEN 'message' THEN m.body
           WHEN 'city_chat_message' THEN cm.content
         END AS reported_message,
         CASE r.target_type::text
           WHEN 'message' THEN COALESCE(NULLIF(btrim(mp.first_name), ''), 'Former member')
           WHEN 'city_chat_message' THEN COALESCE(NULLIF(btrim(cp.first_name), ''), 'Former member')
         END AS reported_sender_first_name
  FROM public.reports r
  JOIN public.profiles p ON p.id = r.reporter_user_id
  LEFT JOIN public.profiles tp ON tp.id = r.target_id
  LEFT JOIN public.messages m ON r.target_type::text = 'message' AND m.id = r.target_id
  LEFT JOIN public.profiles mp ON mp.id = m.sender_user_id
  LEFT JOIN public.city_chat_messages cm ON r.target_type::text = 'city_chat_message' AND cm.id = r.target_id
  LEFT JOIN public.profiles cp ON cp.id = cm.sender_user_id
  WHERE public.is_admin_user(auth.uid())
  ORDER BY r.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_reports() TO authenticated;


-- ─── 6. Flag ───────────────────────────────────────────────────────────────

INSERT INTO public.app_settings (key, value)
VALUES ('ai_city_catchup_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- ─── 7. Translation queue: skip phone-share markers ────────────────────────

CREATE OR REPLACE FUNCTION public.queue_chat_translation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  v_recipient uuid;
  v_lang text;
  v_flag boolean;
  v_admin boolean;
  v_text text := btrim(COALESCE(NEW.body, ''));
BEGIN
  -- Special cards and anything with no real words: no translation.
  IF NEW.sender_user_id IS NULL
     OR NEW.guide_question_id IS NOT NULL
     OR left(v_text, 9) = '[[image]]'
     OR left(v_text, 11) = '[[checkin]]'
     OR left(v_text, 15) = '[[phone_share]]'
     OR left(v_text, 15) = '[Photo removed]'
     OR char_length(v_text) < 3
     OR v_text ~ '^[[:space:][:punct:][:digit:]]*$' THEN
    RETURN NULL;
  END IF;

  SELECT owner_user_id, sitter_user_id INTO c FROM public.conversations WHERE id = NEW.conversation_id;
  IF c.owner_user_id IS NULL OR c.sitter_user_id IS NULL THEN
    RETURN NULL; -- a former member's chat
  END IF;
  v_recipient := CASE WHEN c.owner_user_id = NEW.sender_user_id THEN c.sitter_user_id ELSE c.owner_user_id END;

  SELECT preferred_language INTO v_lang FROM public.profiles WHERE id = v_recipient;
  IF v_lang IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT (value = 'true'::jsonb) INTO v_flag FROM public.app_settings WHERE key = 'chat_translate_enabled';
  IF NOT COALESCE(v_flag, false) THEN
    SELECT is_admin INTO v_admin FROM public.profiles WHERE id = NEW.sender_user_id;
    IF NOT COALESCE(v_admin, false) THEN
      RETURN NULL;
    END IF;
  END IF;

  PERFORM public.request_internal_function('chat-translate', jsonb_build_object('message_id', NEW.id));
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never block or fail sending a message.
  RAISE WARNING 'queue_chat_translation skipped for message %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_chat_translation() FROM PUBLIC, anon, authenticated;


-- ─── 8. scrub_contact_details, as in 20261003090000_batch_c_parent_tools ──

CREATE OR REPLACE FUNCTION public.scrub_contact_details(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(COALESCE(p_text, ''),
              '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '', 'g'),
            '(https?://|www\.)[^[:space:]<>"'')]+', '', 'gi'),
          '\m[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|uk|app|dev|info|biz|global)(/[^[:space:]<>"'')]*)?\M', '', 'gi'),
        '(^|[[:space:]])@[A-Za-z0-9_.]{2,30}\M', '\1', 'g'),
      -- Phones: + or 00 with 8+ digits, or any run of 9+ digits with the
      -- usual separators.
      '(\+|\m00)[0-9]([[:space:]().-]*[0-9]){7,}|[0-9]([[:space:]().-]*[0-9]){8,}', '', 'g'),
    '[[:space:]]{2,}', ' ', 'g'));
$$;
