-- ═══════════════════════════════════════════════════════════════════════════
-- Batch E1: reviews redesign, block a member, word filter, profile privacy
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Applied by Lovable only. Policies on profiles, reviews and the City Chat
-- tables are dropped and recreated by table (DO loops), so this works even
-- where the live names differ from our repo.
--
--  1. Grants tidy-up: no TRUNCATE, TRIGGER or REFERENCES for anon or
--     authenticated on any public table; signed-out visitors can't write to
--     any table directly. d2_discoverability_before is dropped.
--  2. Word filter: blocked_terms (admin only), text_violation(), triggers on
--     public text (swearing and banned words) and on private chat and private
--     review notes (banned words only).
--  3. Block a member: member_blocks, blocked_between() (server only), and the
--     rules that follow from a block (no new messages, conversations,
--     applications or invitations; pending ones paused; hidden from each
--     other; a confirmed sit that hasn't started is cancelled).
--  4. Reviews: one per sit per writer, the right reviewee, inside the 14-day
--     window; would_again and highlights; both reviews appear together
--     (published_at); replies; Report a review; one rating function
--     (member_ratings) for every average on the site; reviews read through
--     get_member_reviews / get_member_review_summary; AI summary table.
--  5. Profile privacy: profiles rows only for yourself, admins, discoverable
--     members not blocked either way, and members you share something with.
--
-- Nothing here logs or stores message, review or reply text anywhere new.


-- ─── 1. Grants tidy-up ─────────────────────────────────────────────────────

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM anon, authenticated', r.relname);
    -- Signed-out visitors never write to a table directly (contact form,
    -- founding spots and shared stories all go through server functions).
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', r.relname);
  END LOOP;
  -- Column-level grants are separate from table-level ones: remove those too.
  FOR r IN
    SELECT c.relname, a.attname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND a.attacl IS NOT NULL
  LOOP
    EXECUTE format('REVOKE INSERT (%I), UPDATE (%I), REFERENCES (%I) ON public.%I FROM anon', r.attname, r.attname, r.attname, r.relname);
    EXECUTE format('REVOKE REFERENCES (%I) ON public.%I FROM authenticated', r.attname, r.relname);
  END LOOP;
END;
$$;

-- The D2 discoverability snapshot was only for the D2 proof.
DO $$
BEGIN
  IF to_regclass('public.d2_discoverability_before') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_depend d
       WHERE d.refobjid = 'public.d2_discoverability_before'::regclass
         AND d.deptype = 'n'
         AND d.classid = 'pg_rewrite'::regclass
     ) THEN
    DROP TABLE public.d2_discoverability_before;
  END IF;
END;
$$;


-- ─── 2. Word filter ────────────────────────────────────────────────────────
-- Two levels. 'banned' (slurs, explicit sexual words, threats) is refused
-- everywhere, private chat included. 'swear' is refused in public places
-- (reviews, replies, profile bios and headlines, listing text, Sit Stories,
-- City Chats) and allowed in a private 1:1 chat, where only the sender sees a
-- friendly note (the app asks text_has_swearing after sending).
-- Matching is on whole words after lowercasing, removing accents and common
-- letter swaps, so "Scunthorpe", "class" and "assess" pass. Nothing about the
-- text is ever logged, and the error never repeats the word.

CREATE TABLE IF NOT EXISTS public.blocked_terms (
  term text PRIMARY KEY,
  level text NOT NULL CHECK (level IN ('banned', 'swear')),
  norm text NOT NULL,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blocked_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blocked_terms FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.blocked_terms TO authenticated;
GRANT ALL ON public.blocked_terms TO service_role;

DROP POLICY IF EXISTS "Admins read blocked terms" ON public.blocked_terms;
CREATE POLICY "Admins read blocked terms" ON public.blocked_terms
  FOR SELECT TO authenticated USING (public.is_admin_user(auth.uid()));
DROP POLICY IF EXISTS "Admins add blocked terms" ON public.blocked_terms;
CREATE POLICY "Admins add blocked terms" ON public.blocked_terms
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user(auth.uid()));
DROP POLICY IF EXISTS "Admins remove blocked terms" ON public.blocked_terms;
CREATE POLICY "Admins remove blocked terms" ON public.blocked_terms
  FOR DELETE TO authenticated USING (public.is_admin_user(auth.uid()));

-- Lowercase, no accents, common letter swaps (0→o, 1→i, 3→e, 4→a, @→a,
-- $→s, !→i, 5→s, 7→t), runs of 3+ of the same letter squashed ("shiiit"),
-- everything else becomes a space. Padded with spaces for whole-word checks.
CREATE OR REPLACE FUNCTION public.filter_normalize(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ' ' || btrim(regexp_replace(
           regexp_replace(
             translate(lower(public.unaccent_fallback(COALESCE(p_text, ''))), '0134@$!57', 'oieaasist'),
             '([a-z])\1{2,}', '\1', 'g'),
           '[^a-z]+', ' ', 'g')) || ' ';
$$;

REVOKE ALL ON FUNCTION public.filter_normalize(text) FROM PUBLIC, anon, authenticated;

-- Terms are stored with their normalised form; admins can add phrases too.
CREATE OR REPLACE FUNCTION public.blocked_terms_normalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.norm := btrim(public.filter_normalize(NEW.term));
  IF NEW.norm = '' THEN
    RAISE EXCEPTION 'Please enter a word or phrase with letters.' USING ERRCODE = '22023';
  END IF;
  NEW.term := lower(btrim(NEW.term));
  IF NEW.added_by IS NULL THEN NEW.added_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.blocked_terms_normalize() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS blocked_terms_normalize ON public.blocked_terms;
CREATE TRIGGER blocked_terms_normalize
BEFORE INSERT OR UPDATE ON public.blocked_terms
FOR EACH ROW EXECUTE FUNCTION public.blocked_terms_normalize();

-- 'banned', 'swear' or null. Banned wins. A single word also matches with a
-- common ending (s, es, ed, er, ers, ing, in, y); phrases match as written.
CREATE OR REPLACE FUNCTION public.text_violation(p_text text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_level text := NULL;
  t record;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN NULL;
  END IF;
  v_norm := public.filter_normalize(p_text);
  FOR t IN SELECT bt.norm, bt.level FROM public.blocked_terms bt ORDER BY (bt.level = 'banned') DESC LOOP
    IF (position(' ' IN t.norm) > 0 AND position(' ' || t.norm || ' ' IN v_norm) > 0)
       OR (position(' ' IN t.norm) = 0 AND v_norm ~ (' ' || t.norm || '(s|es|ed|er|ers|ing|in|y)? ')) THEN
      IF t.level = 'banned' THEN
        RETURN 'banned';
      END IF;
      v_level := 'swear';
    END IF;
  END LOOP;
  RETURN v_level;
END;
$$;

REVOKE ALL ON FUNCTION public.text_violation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.text_violation(text) TO service_role;

-- For the friendly note in a private chat, after a message was sent.
CREATE OR REPLACE FUNCTION public.text_has_swearing(p_text text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND public.text_violation(left(p_text, 4000)) IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.text_has_swearing(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.text_has_swearing(text) TO authenticated;

-- BEFORE INSERT OR UPDATE. TG_ARGV[0] is 'public' (refuse banned and
-- swearing) or 'private' (refuse banned only); the rest are the text columns.
-- On UPDATE only columns that changed are checked, so older text never blocks
-- an unrelated change.
CREATE OR REPLACE FUNCTION public.enforce_word_filter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_col text;
  v_hit text;
  i integer;
BEGIN
  FOR i IN 1 .. TG_NARGS - 1 LOOP
    v_col := TG_ARGV[i];
    IF TG_OP = 'UPDATE' AND (v_new ->> v_col) IS NOT DISTINCT FROM (v_old ->> v_col) THEN
      CONTINUE;
    END IF;
    v_hit := public.text_violation(v_new ->> v_col);
    IF v_hit = 'banned' THEN
      RAISE EXCEPTION 'Message not sent. It has words that aren''t allowed on NomadNest, such as slurs, sexual words or threats. Please change it and try again.'
        USING ERRCODE = 'P0001', HINT = 'word_filter_banned';
    ELSIF v_hit = 'swear' AND TG_ARGV[0] = 'public' THEN
      RAISE EXCEPTION 'Not saved. Please remove the swear words. They aren''t allowed in reviews, profiles, listings or City Chats.'
        USING ERRCODE = 'P0001', HINT = 'word_filter_swear';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_word_filter() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('profiles', 'public', ARRAY['bio']),
      ('sitter_profiles', 'public', ARRAY['headline', 'bio', 'why_i_sit', 'experience_details']),
      ('owner_profiles', 'public', ARRAY['bio']),
      ('listings', 'public', ARRAY['title', 'description', 'ideal_sitter_description', 'house_rules_other', 'home_care_tasks_other', 'requirements_other']),
      ('sit_stories', 'public', ARRAY['title', 'story']),
      ('city_chat_messages', 'public', ARRAY['content']),
      ('messages', 'private', ARRAY['body']),
      ('review_flag_evidence', 'private', ARRAY['reason_text']),
      ('community_flags', 'private', ARRAY['note'])
    ) AS v(tbl, lvl, cols)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS word_filter ON public.%I', r.tbl);
    EXECUTE format(
      'CREATE TRIGGER word_filter BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_word_filter(%L, %s)',
      r.tbl, r.lvl, (SELECT string_agg(quote_literal(c), ', ') FROM unnest(r.cols) c));
  END LOOP;
END;
$$;

-- Starter list. Admins add and remove terms in the Founder admin panel.
-- Words with a common innocent meaning on a pet and home site (for example
-- "pussy", "cock", "tits", "ass", "anal", "coon", "dyke", "fag") are left out
-- on purpose; admins can add them if they cause trouble.
INSERT INTO public.blocked_terms (term, level) VALUES
  -- Hate slurs (race, religion, sexuality, gender, disability)
  ('nigger', 'banned'), ('nigga', 'banned'), ('kike', 'banned'), ('spic', 'banned'),
  ('wetback', 'banned'), ('gook', 'banned'), ('raghead', 'banned'), ('towelhead', 'banned'),
  ('paki', 'banned'), ('sandnigger', 'banned'), ('beaner', 'banned'), ('faggot', 'banned'),
  ('tranny', 'banned'), ('shemale', 'banned'), ('retard', 'banned'), ('retarded', 'banned'),
  ('spastic', 'banned'), ('spaz', 'banned'), ('cunt', 'banned'), ('whore', 'banned'), ('slut', 'banned'),
  -- Explicit sexual words
  ('porn', 'banned'), ('porno', 'banned'), ('blowjob', 'banned'), ('handjob', 'banned'),
  ('cumshot', 'banned'), ('dildo', 'banned'), ('jizz', 'banned'), ('milf', 'banned'),
  ('orgasm', 'banned'), ('horny', 'banned'), ('nudes', 'banned'), ('sexting', 'banned'),
  ('boner', 'banned'), ('titties', 'banned'), ('cocksucker', 'banned'), ('motherfucker', 'banned'),
  -- Threats
  ('i will kill you', 'banned'), ('i ll kill you', 'banned'), ('ill kill you', 'banned'),
  ('i m going to kill you', 'banned'), ('im going to kill you', 'banned'), ('gonna kill you', 'banned'),
  ('i will hurt you', 'banned'), ('i ll hurt you', 'banned'), ('kill yourself', 'banned'), ('kys', 'banned'),
  ('i know where you live', 'banned'), ('you re dead', 'banned'), ('you are dead', 'banned'),
  -- Swearing
  ('fuck', 'swear'), ('fck', 'swear'), ('fuk', 'swear'), ('wtf', 'swear'), ('stfu', 'swear'),
  ('shit', 'swear'), ('shite', 'swear'), ('bullshit', 'swear'), ('shithead', 'swear'),
  ('bitch', 'swear'), ('bastard', 'swear'), ('bollocks', 'swear'), ('wanker', 'swear'),
  ('twat', 'swear'), ('prick', 'swear'), ('arse', 'swear'), ('arsehole', 'swear'), ('asshole', 'swear'),
  ('dickhead', 'swear'), ('bellend', 'swear'), ('tosser', 'swear'), ('douchebag', 'swear'),
  ('piss', 'swear'), ('crap', 'swear')
ON CONFLICT (term) DO NOTHING;


-- ─── 3. Block a member ─────────────────────────────────────────────────────
-- The blocker reads, adds and removes only their own rows; the blocked member
-- can never read them. Every other rule asks blocked_between (server only) or
-- the yes/no wrappers below, which only ever answer about the signed-in
-- member and someone they are dealing with, and never say who blocked whom.

CREATE TABLE IF NOT EXISTS public.member_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT member_blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS member_blocks_blocked_idx ON public.member_blocks (blocked_id);

ALTER TABLE public.member_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.member_blocks TO authenticated;
GRANT ALL ON public.member_blocks TO service_role;

DROP POLICY IF EXISTS "Members see who they blocked" ON public.member_blocks;
CREATE POLICY "Members see who they blocked" ON public.member_blocks
  FOR SELECT TO authenticated USING (blocker_id = auth.uid());
DROP POLICY IF EXISTS "Members block others" ON public.member_blocks;
CREATE POLICY "Members block others" ON public.member_blocks
  FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid() AND blocked_id <> auth.uid());
DROP POLICY IF EXISTS "Members unblock" ON public.member_blocks;
CREATE POLICY "Members unblock" ON public.member_blocks
  FOR DELETE TO authenticated USING (blocker_id = auth.uid());
DROP POLICY IF EXISTS "Admins see every block" ON public.member_blocks;
CREATE POLICY "Admins see every block" ON public.member_blocks
  FOR SELECT TO authenticated USING (public.is_admin_user(auth.uid()));

-- Server only: a block either way between two members.
CREATE OR REPLACE FUNCTION public.blocked_between(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_a IS NOT NULL AND p_b IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.member_blocks mb
    WHERE (mb.blocker_id = p_a AND mb.blocked_id = p_b)
       OR (mb.blocker_id = p_b AND mb.blocked_id = p_a)
  );
$$;

REVOKE ALL ON FUNCTION public.blocked_between(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blocked_between(uuid, uuid) TO service_role;

-- Can the signed-in member and this member reach each other? Always false
-- for visitors (they never see member rows these rules protect).
CREATE OR REPLACE FUNCTION public.is_blocked_with(p_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND public.blocked_between(auth.uid(), p_other);
$$;

REVOKE ALL ON FUNCTION public.is_blocked_with(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_with(uuid) TO anon, authenticated, service_role;

-- Hidden because of a block, except while a sit between them is happening
-- (that chat, listing and profile stay open until the sit ends).
CREATE OR REPLACE FUNCTION public.hidden_by_block(p_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_blocked_with(p_other)
     AND NOT EXISTS (
       SELECT 1 FROM public.sits s
       WHERE s.status = 'in_progress'
         AND ((s.owner_user_id = auth.uid() AND s.sitter_user_id = p_other)
           OR (s.owner_user_id = p_other AND s.sitter_user_id = auth.uid()))
     );
$$;

REVOKE ALL ON FUNCTION public.hidden_by_block(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hidden_by_block(uuid) TO anon, authenticated, service_role;

-- Messages: keyed on the conversation the member is writing in (another
-- table), answering only for its two members.
CREATE OR REPLACE FUNCTION public.conversation_open_to_me(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT NOT public.hidden_by_block(CASE WHEN c.owner_user_id = auth.uid() THEN c.sitter_user_id ELSE c.owner_user_id END)
    FROM public.conversations c
    WHERE c.id = p_conversation_id AND auth.uid() IN (c.owner_user_id, c.sitter_user_id)
  ), false);
$$;

REVOKE ALL ON FUNCTION public.conversation_open_to_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversation_open_to_me(uuid) TO authenticated, service_role;

-- Applying: keyed on the listing being applied to.
CREATE OR REPLACE FUNCTION public.listing_owner_blocked_with_me(p_listing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT public.is_blocked_with(l.owner_user_id) FROM public.listings l WHERE l.id = p_listing_id), false);
$$;

REVOKE ALL ON FUNCTION public.listing_owner_blocked_with_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listing_owner_blocked_with_me(uuid) TO authenticated, service_role;

-- Restrictive rules on top of whatever else each table allows.
DROP POLICY IF EXISTS "No messages across a block" ON public.messages;
CREATE POLICY "No messages across a block" ON public.messages
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.conversation_open_to_me(conversation_id));

DROP POLICY IF EXISTS "No new conversations across a block" ON public.conversations;
CREATE POLICY "No new conversations across a block" ON public.conversations
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.hidden_by_block(CASE WHEN owner_user_id = auth.uid() THEN sitter_user_id ELSE owner_user_id END));

DROP POLICY IF EXISTS "No applications across a block" ON public.applications;
CREATE POLICY "No applications across a block" ON public.applications
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.listing_owner_blocked_with_me(listing_id));

DROP POLICY IF EXISTS "No invitations across a block" ON public.sitter_invites;
CREATE POLICY "No invitations across a block" ON public.sitter_invites
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_blocked_with(sitter_user_id));

-- Browse Sits, listing pages: the other member's listing is hidden.
DROP POLICY IF EXISTS "Listings hidden across a block" ON public.listings;
CREATE POLICY "Listings hidden across a block" ON public.listings
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (auth.uid() = owner_user_id OR NOT public.hidden_by_block(owner_user_id));

-- Browse Nomads, Nomads Near Me, Nomad profiles.
DROP POLICY IF EXISTS "Nomad profiles hidden across a block" ON public.sitter_profiles;
CREATE POLICY "Nomad profiles hidden across a block" ON public.sitter_profiles
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR NOT public.hidden_by_block(user_id));

DROP POLICY IF EXISTS "Pet Parent profiles hidden across a block" ON public.owner_profiles;
CREATE POLICY "Pet Parent profiles hidden across a block" ON public.owner_profiles
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR NOT public.hidden_by_block(user_id));

-- City Chats: each stops seeing the other's messages and replies.
DO $$
BEGIN
  IF to_regclass('public.city_chat_messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "City Chat messages hidden across a block" ON public.city_chat_messages;
    CREATE POLICY "City Chat messages hidden across a block" ON public.city_chat_messages
      AS RESTRICTIVE FOR SELECT TO authenticated
      USING (sender_user_id = auth.uid() OR NOT public.is_blocked_with(sender_user_id));
  END IF;
END;
$$;

-- No new sit between members while a block exists (accepting an old
-- application or invitation by id included).
CREATE OR REPLACE FUNCTION public.refuse_sit_across_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.blocked_between(NEW.owner_user_id, NEW.sitter_user_id) THEN
    RAISE EXCEPTION 'This isn''t available right now.' USING ERRCODE = '42501', HINT = 'blocked';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_sit_across_block() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS refuse_sit_across_block ON public.sits;
CREATE TRIGGER refuse_sit_across_block
BEFORE INSERT ON public.sits
FOR EACH ROW EXECUTE FUNCTION public.refuse_sit_across_block();

-- Blocking someone with a confirmed sit that hasn't started cancels it,
-- through the same rules as any cancellation: the cancellation triggers run
-- (the reliability strike within 2 weeks of the start, applications on those
-- dates, phone shares), and the dates open again. No reason is posted in the
-- chat, and the notification never mentions blocking.
CREATE OR REPLACE FUNCTION public.cancel_sits_on_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  v_other uuid;
BEGIN
  FOR s IN
    SELECT si.id, si.owner_user_id, si.sitter_user_id, si.sit_dates_id,
           COALESCE(l.city, si.snapshot_city) AS city,
           COALESCE(sd.start_date, si.snapshot_start_date) AS start_date,
           COALESCE(sd.end_date, si.snapshot_end_date) AS end_date
    FROM public.sits si
    LEFT JOIN public.listings l ON l.id = si.listing_id
    LEFT JOIN public.sit_dates sd ON sd.id = si.sit_dates_id
    WHERE si.status = 'confirmed'
      AND ((si.owner_user_id = NEW.blocker_id AND si.sitter_user_id = NEW.blocked_id)
        OR (si.owner_user_id = NEW.blocked_id AND si.sitter_user_id = NEW.blocker_id))
  LOOP
    UPDATE public.sits
    SET status = 'cancelled', cancelled_at = now(), cancelled_from_status = 'confirmed'
    WHERE id = s.id AND status = 'confirmed';

    IF s.sit_dates_id IS NOT NULL AND s.end_date >= current_date THEN
      UPDATE public.sit_dates SET status = 'open' WHERE id = s.sit_dates_id;
    END IF;

    v_other := NEW.blocked_id;
    BEGIN
      PERFORM public.request_internal_function('send-notification-email', jsonb_build_object(
        'type', 'sit_cancelled',
        'recipientUserId', v_other::text,
        'data', jsonb_build_object(
          'sit_id', s.id::text,
          'quiet', CASE WHEN NEW.blocker_id = s.owner_user_id THEN 'owner_cancelled' ELSE 'nomad_cancelled' END,
          'cancelledByName', COALESCE((SELECT NULLIF(btrim(first_name), '') FROM public.profiles WHERE id = NEW.blocker_id), ''),
          'city', COALESCE(s.city, ''),
          'startDate', COALESCE(s.start_date::text, ''),
          'endDate', COALESCE(s.end_date::text, ''),
          'url', CASE WHEN NEW.blocker_id = s.owner_user_id THEN '/browse-sits' ELSE '/browse-sitters' END
        )
      ));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cancel_sits_on_block: notification not queued for sit %', s.id;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_sits_on_block() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cancel_sits_on_block ON public.member_blocks;
CREATE TRIGGER cancel_sits_on_block
AFTER INSERT ON public.member_blocks
FOR EACH ROW EXECUTE FUNCTION public.cancel_sits_on_block();

-- Settings, Privacy: the members I blocked, first name and photo only.
CREATE OR REPLACE FUNCTION public.get_my_blocked_members()
RETURNS TABLE (blocked_id uuid, first_name text, avatar_url text, blocked_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mb.blocked_id,
         COALESCE(NULLIF(btrim(p.first_name), ''), 'Former member'),
         p.avatar_url,
         mb.created_at
  FROM public.member_blocks mb
  LEFT JOIN public.profiles p ON p.id = mb.blocked_id
  WHERE mb.blocker_id = auth.uid()
  ORDER BY mb.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_my_blocked_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_blocked_members() TO authenticated;

-- Pending applications and invitations between blocked members are paused
-- (hidden from both sides, never declined, so nothing notifies), like the D2
-- membership pause. They come back after an unblock.
CREATE OR REPLACE FUNCTION public.application_is_live(
  p_status public.application_status,
  p_sitter_user_id uuid,
  p_listing_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  SELECT l.owner_user_id INTO v_owner FROM public.listings l WHERE l.id = p_listing_id;
  -- Only for the two members of this application.
  IF v_uid IS NULL OR v_owner IS NULL OR v_uid NOT IN (p_sitter_user_id, v_owner) THEN
    RETURN false;
  END IF;
  -- Decided applications are always live; pending ones only while both have
  -- their side and neither has blocked the other.
  RETURN p_status NOT IN ('applied', 'shortlisted')
      OR (public.has_side_access(p_sitter_user_id, 'sitter') AND public.has_side_access(v_owner, 'owner')
          AND NOT public.blocked_between(p_sitter_user_id, v_owner));
END;
$$;

REVOKE ALL ON FUNCTION public.application_is_live(public.application_status, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.application_is_live(public.application_status, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.invitation_is_live(p_status text, p_sitter_user_id uuid, p_owner_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR v_uid NOT IN (p_sitter_user_id, p_owner_user_id) THEN
    RETURN false;
  END IF;
  RETURN p_status NOT IN ('pending', 'viewed')
      OR (public.has_side_access(p_sitter_user_id, 'sitter') AND public.has_side_access(p_owner_user_id, 'owner')
          AND NOT public.blocked_between(p_sitter_user_id, p_owner_user_id));
END;
$$;

REVOKE ALL ON FUNCTION public.invitation_is_live(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invitation_is_live(text, uuid, uuid) TO authenticated, service_role;

-- Signed-out and member cards: never someone hidden by a block.
CREATE OR REPLACE FUNCTION public.get_public_member_cards(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'first_name', NULLIF(TRIM(p.first_name), ''),
    'avatar_url', p.avatar_url
  )), '[]'::jsonb)
  FROM public.profiles p
  WHERE p.id = ANY (p_user_ids[1:100])
    AND public.profile_is_discoverable(p.id)
    AND NOT public.hidden_by_block(p.id);
$function$;


-- ─── 4. Reports: a review, and a member with the chat attached ─────────────
-- A new enum value can't be used until this migration commits, so below it
-- is only ever compared as text.
ALTER TYPE public.report_target_type ADD VALUE IF NOT EXISTS 'review';

-- "Also report {first name}" after a block: admins can open that chat.
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS conversation_id uuid
  REFERENCES public.conversations(id) ON DELETE SET NULL;
GRANT INSERT (conversation_id) ON public.reports TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_report_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.request_is_end_user() THEN
    RETURN NEW;
  END IF;

  -- The chat attached must be the reporter's own chat with that member.
  IF NEW.conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = NEW.conversation_id
      AND auth.uid() IN (c.owner_user_id, c.sitter_user_id)
      AND NEW.target_type::text = 'user'
      AND NEW.target_id IN (c.owner_user_id, c.sitter_user_id)
      AND NEW.target_id <> auth.uid()
  ) THEN
    RAISE EXCEPTION 'That chat can''t be attached to this report.' USING ERRCODE = '42501';
  END IF;

  IF NEW.target_type::text = 'review' THEN
    -- A published review someone else wrote, reported once per member.
    IF NOT EXISTS (
      SELECT 1 FROM public.reviews r
      WHERE r.id = NEW.target_id AND r.published_at IS NOT NULL
        AND r.reviewer_user_id IS DISTINCT FROM auth.uid()
    ) THEN
      RAISE EXCEPTION 'This review can''t be reported.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.reports x
      WHERE x.reporter_user_id = auth.uid() AND x.target_type::text = 'review' AND x.target_id = NEW.target_id
    ) THEN
      RAISE EXCEPTION 'You already reported this review.' USING ERRCODE = '23505', HINT = 'already_reported';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_report_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_report_insert ON public.reports;
CREATE TRIGGER guard_report_insert
BEFORE INSERT ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.guard_report_insert();

-- Admins: the reported review's text and writer, and the attached chat.
DROP FUNCTION IF EXISTS public.admin_list_reports();
CREATE FUNCTION public.admin_list_reports()
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
  reported_sender_first_name text,
  conversation_id uuid
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
           WHEN 'review' THEN rv.text
         END AS reported_message,
         CASE r.target_type::text
           WHEN 'message' THEN COALESCE(NULLIF(btrim(mp.first_name), ''), 'Former member')
           WHEN 'city_chat_message' THEN COALESCE(NULLIF(btrim(cp.first_name), ''), 'Former member')
           WHEN 'review' THEN COALESCE(NULLIF(btrim(rp.first_name), ''), 'Former member')
         END AS reported_sender_first_name,
         r.conversation_id
  FROM public.reports r
  JOIN public.profiles p ON p.id = r.reporter_user_id
  LEFT JOIN public.profiles tp ON tp.id = r.target_id
  LEFT JOIN public.messages m ON r.target_type::text = 'message' AND m.id = r.target_id
  LEFT JOIN public.profiles mp ON mp.id = m.sender_user_id
  LEFT JOIN public.city_chat_messages cm ON r.target_type::text = 'city_chat_message' AND cm.id = r.target_id
  LEFT JOIN public.profiles cp ON cp.id = cm.sender_user_id
  LEFT JOIN public.reviews rv ON r.target_type::text = 'review' AND rv.id = r.target_id
  LEFT JOIN public.profiles rp ON rp.id = rv.reviewer_user_id
  WHERE public.is_admin_user(auth.uid())
  ORDER BY r.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_reports() TO authenticated;

-- Admins open an attached chat (read only) to check what happened.
CREATE OR REPLACE FUNCTION public.admin_get_report_chat(p_report_id uuid)
RETURNS TABLE (sender_first_name text, is_reporter boolean, body text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv uuid;
  v_reporter uuid;
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  SELECT r.conversation_id, r.reporter_user_id INTO v_conv, v_reporter FROM public.reports r WHERE r.id = p_report_id;
  IF v_conv IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT COALESCE(NULLIF(btrim(p.first_name), ''), 'Former member'),
         m.sender_user_id = v_reporter,
         m.body,
         m.created_at
  FROM public.messages m
  LEFT JOIN public.profiles p ON p.id = m.sender_user_id
  WHERE m.conversation_id = v_conv
  ORDER BY m.created_at
  LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_report_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_report_chat(uuid) TO authenticated;


-- ─── 5. Reviews ────────────────────────────────────────────────────────────

-- 5a. New columns. would_again: the optional "again" answer (only a Yes is
-- ever shown; every answer counts towards the percentage). highlights: the
-- "What stood out?" picks, fixed keys, up to 3. published_at: null until both
-- have reviewed or the 14-day window closes.
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS would_again boolean;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS highlights text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_highlights_check;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_highlights_check CHECK (
  cardinality(highlights) <= 3
  AND highlights <@ ARRAY[
    -- A Pet Parent writing about a Nomad
    'great_with_pets', 'great_with_cats', 'great_with_dogs', 'spotless_home',
    'daily_photos', 'great_communicator', 'calm_reliable', 'extra_mile',
    -- A Nomad writing about a Pet Parent
    'home_like_photos', 'helpful_guide', 'sweet_pets', 'warm_welcome',
    'clear_instructions', 'great_location', 'good_wifi'
  ]::text[]
);

-- The reviews already on the site stay visible.
UPDATE public.reviews SET published_at = now() WHERE published_at IS NULL;

-- One review per sit per writer.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_sit_writer ON public.reviews (sit_id, reviewer_user_id);
CREATE INDEX IF NOT EXISTS reviews_reviewee_published_idx ON public.reviews (reviewee_user_id, published_at);

GRANT SELECT (would_again, highlights, published_at) ON public.reviews TO authenticated;
GRANT INSERT (would_again, highlights) ON public.reviews TO authenticated;
-- Signed-out visitors only ever get averages and counts (member_ratings).
REVOKE SELECT ON public.reviews FROM anon;
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT attname FROM pg_attribute WHERE attrelid = 'public.reviews'::regclass AND attnum > 0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE SELECT (%I) ON public.reviews FROM anon', r.attname);
  END LOOP;
END;
$$;

-- 5b. The review window. The end of a sit is the same date the dashboard
-- (reviews_due), the review-reminders job and auto-complete use: the day it
-- was cancelled for a sit cut short, otherwise its end date. Reviews are open
-- on that day and the 13 days after it (14 days in all).
CREATE OR REPLACE FUNCTION public.sit_review_end(p_sit_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN s.status = 'cancelled' THEN s.cancelled_at::date
              ELSE COALESCE(sd.end_date, s.snapshot_end_date) END
  FROM public.sits s
  LEFT JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
  WHERE s.id = p_sit_id;
$$;

REVOKE ALL ON FUNCTION public.sit_review_end(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sit_review_end(uuid) TO service_role;

-- Insert rule, keyed on the sit (another table) and the row's own reviewee:
-- the writer and the reviewee are the two members of a completed sit (or one
-- cut short while it was happening), inside the window.
CREATE OR REPLACE FUNCTION public.review_insert_allowed(p_sit_id uuid, p_reviewee uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT auth.uid() IS NOT NULL
       AND s.owner_user_id IS NOT NULL AND s.sitter_user_id IS NOT NULL
       AND (s.status = 'completed' OR (s.status = 'cancelled' AND s.cancelled_from_status = 'in_progress'))
       AND ((s.owner_user_id = auth.uid() AND p_reviewee = s.sitter_user_id)
         OR (s.sitter_user_id = auth.uid() AND p_reviewee = s.owner_user_id))
       AND current_date - public.sit_review_end(s.id) BETWEEN 0 AND 13
    FROM public.sits s WHERE s.id = p_sit_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.review_insert_allowed(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_insert_allowed(uuid, uuid) TO authenticated, service_role;

-- 5c. Policies, recreated by table so nothing old is left behind.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews' LOOP
    EXECUTE format('DROP POLICY %I ON public.reviews', r.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "Admins can view all reviews" ON public.reviews
  FOR SELECT TO authenticated USING (public.is_admin_user(auth.uid()));
-- The writer always sees their own review; the reviewee once it's published.
-- Everyone else reads reviews through get_member_reviews.
CREATE POLICY "Writers see their own reviews" ON public.reviews
  FOR SELECT TO authenticated USING (reviewer_user_id = auth.uid());
CREATE POLICY "Reviewees see published reviews about them" ON public.reviews
  FOR SELECT TO authenticated USING (reviewee_user_id = auth.uid() AND published_at IS NOT NULL);
CREATE POLICY "Sit members can write one review" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (reviewer_user_id = auth.uid() AND public.review_insert_allowed(sit_id, reviewee_user_id));

-- 5d. Before insert: the picks must belong to the side being reviewed, and a
-- member can never publish their own review early.
CREATE OR REPLACE FUNCTION public.review_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_about_nomad boolean;
BEGIN
  IF public.request_is_end_user() THEN
    NEW.published_at := NULL;
  END IF;
  SELECT NEW.reviewee_user_id = s.sitter_user_id INTO v_about_nomad FROM public.sits s WHERE s.id = NEW.sit_id;
  IF cardinality(NEW.highlights) > 0 AND v_about_nomad IS NOT NULL AND NOT (
    NEW.highlights <@ CASE WHEN v_about_nomad
      THEN ARRAY['great_with_pets', 'great_with_cats', 'great_with_dogs', 'spotless_home', 'daily_photos', 'great_communicator', 'calm_reliable', 'extra_mile']
      ELSE ARRAY['home_like_photos', 'helpful_guide', 'sweet_pets', 'warm_welcome', 'clear_instructions', 'great_location', 'spotless_home', 'good_wifi'] END
  ) THEN
    RAISE EXCEPTION 'Please choose from the list.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.review_before_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS review_before_insert ON public.reviews;
CREATE TRIGGER review_before_insert
BEFORE INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.review_before_insert();

DROP TRIGGER IF EXISTS word_filter ON public.reviews;
CREATE TRIGGER word_filter BEFORE INSERT OR UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.enforce_word_filter('public', 'text');

-- 5e. One place that knows each review's side, score and sit details. Server
-- functions only.
CREATE OR REPLACE VIEW public.review_facts WITH (security_invoker = true) AS
SELECT r.id,
       r.sit_id,
       r.reviewer_user_id,
       r.reviewee_user_id,
       r.rating,
       r.text,
       r.created_at,
       r.published_at,
       r.would_again,
       r.highlights,
       r.rating_pet_care, r.rating_communication, r.rating_cleanliness, r.rating_reliability, r.rating_respect_home,
       r.rating_home_accuracy, r.rating_pet_preparedness, r.rating_hospitality, r.rating_clear_expectations,
       -- 'sitter': a review of a Nomad (from the Pet Parent); 'owner': of a Pet Parent.
       CASE
         WHEN s.id IS NOT NULL THEN
           CASE WHEN r.reviewee_user_id = s.sitter_user_id OR r.reviewer_user_id = s.owner_user_id THEN 'sitter' ELSE 'owner' END
         WHEN COALESCE(r.rating_pet_care, r.rating_cleanliness, r.rating_reliability, r.rating_respect_home) IS NOT NULL THEN 'sitter'
         ELSE 'owner'
       END AS side,
       s.listing_id,
       COALESCE(NULLIF(btrim(s.snapshot_city), ''), NULLIF(btrim(l.city), '')) AS city,
       COALESCE(NULLIF(btrim(s.snapshot_country), ''), NULLIF(btrim(l.country), '')) AS country,
       COALESCE(sd.start_date, s.snapshot_start_date) AS start_date,
       CASE WHEN s.status = 'cancelled' THEN s.cancelled_at::date
            ELSE COALESCE(sd.end_date, s.snapshot_end_date) END AS end_date,
       COALESCE(NULLIF(btrim(l.title), ''), NULLIF(btrim(s.snapshot_title), '')) AS listing_title
FROM public.reviews r
LEFT JOIN public.sits s ON s.id = r.sit_id
LEFT JOIN public.listings l ON l.id = s.listing_id
LEFT JOIN public.sit_dates sd ON sd.id = s.sit_dates_id;

REVOKE ALL ON public.review_facts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.review_facts TO service_role;

-- The score shown on a card: the average of that side's five categories
-- (falling back to the overall rating for older reviews without them).
CREATE OR REPLACE FUNCTION public.review_score(f public.review_facts)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT avg(v) FROM unnest(CASE WHEN f.side = 'sitter'
      THEN ARRAY[f.rating_pet_care, f.rating_communication, f.rating_cleanliness, f.rating_reliability, f.rating_respect_home]
      ELSE ARRAY[f.rating_communication, f.rating_home_accuracy, f.rating_pet_preparedness, f.rating_hospitality, f.rating_clear_expectations] END) v
    WHERE v IS NOT NULL AND v > 0
  ), f.rating::numeric);
$$;

REVOKE ALL ON FUNCTION public.review_score(public.review_facts) FROM PUBLIC, anon, authenticated;

-- 5f. THE rating. Every average on the site (profiles, Browse Nomads, Browse
-- Sits cards, listing pages, applicants, the reviews page) comes from here:
-- published reviews only, recency-weighted like the app always did (reviews
-- under 6 months count 1.5x, 6 to 12 months 1.2x, older 1x). Averages and
-- counts only, so signed-out visitors may call it too.
CREATE OR REPLACE FUNCTION public.member_ratings(p_user_ids uuid[], p_side text)
RETURNS TABLE (user_id uuid, average numeric, review_count integer, categories jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH f AS (
    SELECT rf.*,
           CASE WHEN now() - rf.created_at <= interval '6 months' THEN 1.5
                WHEN now() - rf.created_at <= interval '12 months' THEN 1.2
                ELSE 1.0 END AS w
    FROM public.review_facts rf
    WHERE rf.reviewee_user_id = ANY (p_user_ids[1:200])
      AND rf.published_at IS NOT NULL
      AND rf.side = p_side
  )
  SELECT f.reviewee_user_id,
         round(sum(f.rating * f.w) / NULLIF(sum(f.w), 0), 2),
         count(*)::integer,
         jsonb_strip_nulls(CASE WHEN p_side = 'sitter' THEN jsonb_build_object(
           'rating_pet_care', round(avg(NULLIF(f.rating_pet_care, 0)), 2),
           'rating_communication', round(avg(NULLIF(f.rating_communication, 0)), 2),
           'rating_cleanliness', round(avg(NULLIF(f.rating_cleanliness, 0)), 2),
           'rating_reliability', round(avg(NULLIF(f.rating_reliability, 0)), 2),
           'rating_respect_home', round(avg(NULLIF(f.rating_respect_home, 0)), 2))
         ELSE jsonb_build_object(
           'rating_communication', round(avg(NULLIF(f.rating_communication, 0)), 2),
           'rating_home_accuracy', round(avg(NULLIF(f.rating_home_accuracy, 0)), 2),
           'rating_pet_preparedness', round(avg(NULLIF(f.rating_pet_preparedness, 0)), 2),
           'rating_hospitality', round(avg(NULLIF(f.rating_hospitality, 0)), 2),
           'rating_clear_expectations', round(avg(NULLIF(f.rating_clear_expectations, 0)), 2)) END)
  FROM f
  WHERE p_side IN ('sitter', 'owner')
  GROUP BY f.reviewee_user_id;
$$;

REVOKE ALL ON FUNCTION public.member_ratings(uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_ratings(uuid[], text) TO anon, authenticated, service_role;

-- 5g. Review rate counts published reviews only.
CREATE OR REPLACE FUNCTION public.member_review_rates(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, reviews_written integer, sits_attended integer, review_rate integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    SELECT x.id,
           (SELECT COUNT(*) FROM public.reviews r WHERE r.reviewer_user_id = x.id AND r.published_at IS NOT NULL) AS written,
           (SELECT COUNT(*) FROM public.sits s
            WHERE s.status = 'completed' AND (s.sitter_user_id = x.id OR s.owner_user_id = x.id)) AS sits
    FROM unnest(p_user_ids) AS x(id)
    WHERE auth.uid() IS NOT NULL
  )
  SELECT u.id, u.written::integer, u.sits::integer,
         CASE WHEN u.sits = 0 THEN NULL ELSE ROUND(u.written::numeric / u.sits * 100)::integer END
  FROM u;
$$;

-- 5h. Both reviews appear together. Publishing a sit's reviews tells both
-- members, never with the rating or text.
CREATE OR REPLACE FUNCTION public.publish_sit_reviews(p_sit_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
  v_sit record;
  v_place text;
  v_uid uuid;
  v_side text;
BEGIN
  UPDATE public.reviews SET published_at = now()
  WHERE sit_id = p_sit_id AND published_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN 0;
  END IF;

  SELECT s.owner_user_id, s.sitter_user_id,
         COALESCE(NULLIF(btrim(l.title), ''), NULLIF(btrim(s.snapshot_title), ''), NULLIF(btrim(COALESCE(s.snapshot_city, l.city)), ''), 'your sit') AS place
    INTO v_sit
  FROM public.sits s LEFT JOIN public.listings l ON l.id = s.listing_id
  WHERE s.id = p_sit_id;

  FOREACH v_uid IN ARRAY ARRAY[v_sit.owner_user_id, v_sit.sitter_user_id] LOOP
    CONTINUE WHEN v_uid IS NULL;
    BEGIN
      PERFORM public.request_internal_function('send-notification-email', jsonb_build_object(
        'type', 'reviews_published',
        'recipientUserId', v_uid::text,
        'data', jsonb_build_object(
          'place', v_sit.place,
          'sit_id', p_sit_id::text,
          'url', CASE WHEN v_uid = v_sit.sitter_user_id THEN '/sitter/' ELSE '/owner/' END || v_uid::text || '/reviews'
        )
      ));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'publish_sit_reviews: notification not queued for sit %', p_sit_id;
    END;
  END LOOP;

  -- Refresh the AI summaries of whoever was reviewed.
  FOR v_uid, v_side IN
    SELECT DISTINCT rf.reviewee_user_id, rf.side FROM public.review_facts rf
    WHERE rf.sit_id = p_sit_id AND rf.reviewee_user_id IS NOT NULL
  LOOP
    PERFORM public.queue_review_summary(v_uid, v_side);
  END LOOP;
  RETURN v_n;
END;
$$;

-- Called daily by review-reminders: publishes reviews whose window closed.
CREATE OR REPLACE FUNCTION public.publish_due_reviews()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sit uuid;
  v_total integer := 0;
BEGIN
  FOR v_sit IN
    SELECT DISTINCT r.sit_id FROM public.reviews r
    WHERE r.published_at IS NULL AND r.sit_id IS NOT NULL
      AND current_date - public.sit_review_end(r.sit_id) > 13
  LOOP
    v_total := v_total + public.publish_sit_reviews(v_sit);
  END LOOP;
  -- Reviews whose sit is gone can't wait for a second review.
  UPDATE public.reviews SET published_at = now()
  WHERE published_at IS NULL AND sit_id IS NULL AND created_at < now() - interval '14 days';
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_due_reviews() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_due_reviews() TO service_role;

-- After a review is written: if the other member already wrote theirs, both
-- publish now. Otherwise the reviewee is told someone reviewed them (never
-- the rating or text) and that writing theirs shows it.
CREATE OR REPLACE FUNCTION public.notify_review_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sit record;
  v_reviewer text;
BEGIN
  IF NEW.reviewee_user_id IS NULL OR NEW.reviewer_user_id IS NULL OR NEW.published_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reviews o
    WHERE o.sit_id = NEW.sit_id AND o.reviewer_user_id = NEW.reviewee_user_id AND o.id <> NEW.id
  ) THEN
    PERFORM public.publish_sit_reviews(NEW.sit_id);
    RETURN NEW;
  END IF;

  SELECT owner_user_id, sitter_user_id INTO v_sit FROM public.sits WHERE id = NEW.sit_id;
  SELECT NULLIF(TRIM(first_name), '') INTO v_reviewer FROM public.profiles WHERE id = NEW.reviewer_user_id;

  PERFORM public.request_internal_function('send-notification-email', jsonb_build_object(
    'type', 'review',
    'recipientUserId', NEW.reviewee_user_id::text,
    'data', jsonb_build_object(
      'reviewerName', COALESCE(v_reviewer, 'Someone'),
      'url', '/dashboard?mode=' || CASE WHEN NEW.reviewee_user_id = v_sit.sitter_user_id THEN 'sitter' ELSE 'owner' END
             || '&openReview=' || NEW.sit_id::text,
      'sit_id', NEW.sit_id::text
    )
  ));
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block the review itself.
    RAISE WARNING 'Review notification not queued for review %', NEW.id;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_review_received() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_sit_reviews(uuid) FROM PUBLIC, anon, authenticated;

-- 5i. Waiting card on "Reviews about you": who reviewed me (first name only)
-- while mine isn't written, and the latest date both appear.
CREATE OR REPLACE FUNCTION public.get_my_waiting_reviews()
RETURNS TABLE (sit_id uuid, reviewer_first_name text, other_user_id uuid, my_role text, side text, publish_by date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rf.sit_id,
         COALESCE(NULLIF(btrim(p.first_name), ''), CASE WHEN rf.side = 'sitter' THEN 'your Pet Parent' ELSE 'your Nomad' END),
         rf.reviewer_user_id,
         CASE WHEN rf.side = 'sitter' THEN 'sitter' ELSE 'owner' END,
         rf.side,
         public.sit_review_end(rf.sit_id) + 14
  FROM public.review_facts rf
  LEFT JOIN public.profiles p ON p.id = rf.reviewer_user_id
  WHERE auth.uid() IS NOT NULL
    AND rf.reviewee_user_id = auth.uid()
    AND rf.published_at IS NULL
    AND rf.sit_id IS NOT NULL
    AND current_date - public.sit_review_end(rf.sit_id) BETWEEN 0 AND 13
    AND NOT EXISTS (SELECT 1 FROM public.reviews mine WHERE mine.sit_id = rf.sit_id AND mine.reviewer_user_id = auth.uid())
  ORDER BY 6;
$$;

REVOKE ALL ON FUNCTION public.get_my_waiting_reviews() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_waiting_reviews() TO authenticated;

-- After posting: did the other member already write theirs (both now
-- visible), and when will mine appear at the latest? Writer only.
CREATE OR REPLACE FUNCTION public.get_my_review_status(p_sit_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'written', r.id IS NOT NULL,
    'published', r.published_at IS NOT NULL,
    'publish_by', public.sit_review_end(p_sit_id) + 14
  )
  FROM (SELECT 1) one
  LEFT JOIN public.reviews r ON r.sit_id = p_sit_id AND r.reviewer_user_id = auth.uid()
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_review_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_review_status(uuid) TO authenticated;

-- 5j. Public replies: one per review, by the reviewee, up to 500 characters.
CREATE TABLE IF NOT EXISTS public.review_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL UNIQUE REFERENCES public.reviews(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.review_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_replies FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.review_replies TO authenticated;
GRANT INSERT (review_id, author_user_id, body) ON public.review_replies TO authenticated;
GRANT UPDATE (body) ON public.review_replies TO authenticated;
GRANT ALL ON public.review_replies TO service_role;

-- Keyed on the review being replied to (another table): published, and
-- about the signed-in member.
CREATE OR REPLACE FUNCTION public.can_reply_to_review(p_review_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reviews r
    WHERE r.id = p_review_id AND r.published_at IS NOT NULL
      AND auth.uid() IS NOT NULL AND r.reviewee_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.can_reply_to_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_reply_to_review(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Reviewees see their own replies" ON public.review_replies;
CREATE POLICY "Reviewees see their own replies" ON public.review_replies
  FOR SELECT TO authenticated USING (author_user_id = auth.uid() OR public.is_admin_user(auth.uid()));
DROP POLICY IF EXISTS "Reviewees reply once" ON public.review_replies;
CREATE POLICY "Reviewees reply once" ON public.review_replies
  FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid() AND public.can_reply_to_review(review_id));
DROP POLICY IF EXISTS "Reviewees edit their reply" ON public.review_replies;
CREATE POLICY "Reviewees edit their reply" ON public.review_replies
  FOR UPDATE TO authenticated USING (author_user_id = auth.uid()) WITH CHECK (author_user_id = auth.uid());
DROP POLICY IF EXISTS "Reviewees delete their reply" ON public.review_replies;
CREATE POLICY "Reviewees delete their reply" ON public.review_replies
  FOR DELETE TO authenticated USING (author_user_id = auth.uid());

DROP TRIGGER IF EXISTS update_review_replies_updated_at ON public.review_replies;
CREATE TRIGGER update_review_replies_updated_at
BEFORE UPDATE ON public.review_replies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS word_filter ON public.review_replies;
CREATE TRIGGER word_filter BEFORE INSERT OR UPDATE ON public.review_replies
FOR EACH ROW EXECUTE FUNCTION public.enforce_word_filter('public', 'body');

-- The reviewer hears about a reply (never its text).
CREATE OR REPLACE FUNCTION public.notify_review_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reviewer uuid;
  v_side text;
  v_name text;
BEGIN
  SELECT rf.reviewer_user_id, rf.side INTO v_reviewer, v_side FROM public.review_facts rf WHERE rf.id = NEW.review_id;
  IF v_reviewer IS NULL THEN RETURN NULL; END IF;
  SELECT NULLIF(btrim(first_name), '') INTO v_name FROM public.profiles WHERE id = NEW.author_user_id;
  PERFORM public.request_internal_function('send-notification-email', jsonb_build_object(
    'type', 'review_reply',
    'recipientUserId', v_reviewer::text,
    'data', jsonb_build_object(
      'replierName', COALESCE(v_name, 'Someone'),
      'url', CASE WHEN v_side = 'sitter' THEN '/sitter/' ELSE '/owner/' END || NEW.author_user_id::text || '/reviews'
    )
  ));
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_review_reply: not queued';
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_review_reply() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_review_reply ON public.review_replies;
CREATE TRIGGER notify_review_reply
AFTER INSERT ON public.review_replies
FOR EACH ROW EXECUTE FUNCTION public.notify_review_reply();

-- 5k. AI summary ("What Pet Parents say" / "What Nomads say"): built
-- server-side from published review text only, 5 or more reviews, behind
-- review_summary_enabled (off by default; runs while off when the member
-- being reviewed is an admin). Members read it only through
-- get_member_review_summary.
CREATE TABLE IF NOT EXISTS public.review_ai_summaries (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('sitter', 'owner')),
  summary text NOT NULL,
  review_count integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, side)
);

ALTER TABLE public.review_ai_summaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_ai_summaries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.review_ai_summaries TO service_role;

INSERT INTO public.app_settings (key, value)
VALUES ('review_summary_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.queue_review_summary(p_user uuid, p_side text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL OR p_side NOT IN ('sitter', 'owner') THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.review_facts rf
      WHERE rf.reviewee_user_id = p_user AND rf.side = p_side AND rf.published_at IS NOT NULL
        AND NULLIF(btrim(rf.text), '') IS NOT NULL) < 5 THEN
    RETURN;
  END IF;
  IF NOT (COALESCE((SELECT value = 'true'::jsonb FROM public.app_settings WHERE key = 'review_summary_enabled'), false)
          OR public.is_admin_user(p_user)) THEN
    RETURN;
  END IF;
  PERFORM public.request_internal_function('review-summary', jsonb_build_object('user_id', p_user, 'side', p_side));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'queue_review_summary skipped';
END;
$$;

REVOKE ALL ON FUNCTION public.queue_review_summary(uuid, text) FROM PUBLIC, anon, authenticated;

-- 5l. The reviews list. Authenticated only; nothing across a block either
-- way. Never last names, emails, phones, exact dates, private answers, flags
-- or evidence; would_again is true or null (a No is never shown).
CREATE OR REPLACE FUNCTION public.get_member_reviews(
  p_user uuid,
  p_side text,
  p_filter text DEFAULT 'all',
  p_sort text DEFAULT 'recent',
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  score numeric,
  rating integer,
  categories jsonb,
  text text,
  would_again boolean,
  highlights text[],
  reviewer_first_name text,
  reviewer_avatar_url text,
  reviewer_gone boolean,
  link_listing_id uuid,
  link_profile_id uuid,
  city text,
  country text,
  sit_month date,
  nights integer,
  pets jsonb,
  sits_together integer,
  reply_body text,
  reply_at timestamptz,
  can_reply boolean,
  total_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_user IS NULL OR p_side NOT IN ('sitter', 'owner') OR public.hidden_by_block(p_user) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT rf.*, public.review_score(rf) AS sc
    FROM public.review_facts rf
    WHERE rf.reviewee_user_id = p_user AND rf.side = p_side AND rf.published_at IS NOT NULL
  ),
  filtered AS (
    SELECT b.* FROM base b
    WHERE CASE lower(COALESCE(p_filter, 'all'))
            WHEN '5' THEN round(b.sc) >= 5
            WHEN '4' THEN round(b.sc) = 4
            WHEN '3' THEN round(b.sc) <= 3
            WHEN 'written' THEN NULLIF(btrim(b.text), '') IS NOT NULL
            ELSE true END
  )
  SELECT f.id,
         f.created_at,
         round(f.sc, 1),
         f.rating,
         jsonb_strip_nulls(CASE WHEN f.side = 'sitter' THEN jsonb_build_object(
           'rating_pet_care', f.rating_pet_care, 'rating_communication', f.rating_communication,
           'rating_cleanliness', f.rating_cleanliness, 'rating_reliability', f.rating_reliability,
           'rating_respect_home', f.rating_respect_home)
         ELSE jsonb_build_object(
           'rating_communication', f.rating_communication, 'rating_home_accuracy', f.rating_home_accuracy,
           'rating_pet_preparedness', f.rating_pet_preparedness, 'rating_hospitality', f.rating_hospitality,
           'rating_clear_expectations', f.rating_clear_expectations) END),
         NULLIF(btrim(f.text), ''),
         CASE WHEN f.would_again IS TRUE THEN true END,
         f.highlights,
         CASE WHEN f.reviewer_user_id IS NULL OR rp.id IS NULL THEN NULL ELSE NULLIF(btrim(rp.first_name), '') END,
         CASE WHEN f.reviewer_user_id IS NULL OR rp.id IS NULL THEN NULL ELSE rp.avatar_url END,
         f.reviewer_user_id IS NULL OR rp.id IS NULL,
         -- A Nomad's page: the Pet Parent's live listing.
         CASE WHEN f.side = 'sitter' AND f.reviewer_user_id IS NOT NULL AND f.listing_id IS NOT NULL
                   AND public.listing_is_live(f.listing_id) AND NOT public.hidden_by_block(f.reviewer_user_id)
              THEN f.listing_id END,
         -- A Pet Parent's page: the Nomad's profile while it's discoverable.
         CASE WHEN f.side = 'owner' AND f.reviewer_user_id IS NOT NULL
                   AND EXISTS (SELECT 1 FROM public.sitter_profiles sp WHERE sp.user_id = f.reviewer_user_id AND public.nomad_profile_is_live(sp.id))
                   AND NOT public.hidden_by_block(f.reviewer_user_id)
              THEN f.reviewer_user_id END,
         f.city,
         f.country,
         date_trunc('month', f.end_date)::date,
         CASE WHEN f.start_date IS NULL OR f.end_date IS NULL THEN NULL ELSE GREATEST(f.end_date - f.start_date, 1) END,
         (SELECT jsonb_object_agg(t.k, t.n) FROM (
            SELECT public.canonical_pet_type(pt.type) AS k, count(*) AS n
            FROM public.pets pt WHERE pt.listing_id = f.listing_id
            GROUP BY 1
          ) t WHERE NULLIF(t.k, '') IS NOT NULL),
         (SELECT count(*)::integer FROM public.sits s2
          WHERE s2.status = 'completed'
            AND f.reviewer_user_id IS NOT NULL
            AND ((s2.owner_user_id = f.reviewer_user_id AND s2.sitter_user_id = p_user)
              OR (s2.owner_user_id = p_user AND s2.sitter_user_id = f.reviewer_user_id))),
         rr.body,
         rr.created_at,
         (p_user = v_uid AND rr.id IS NULL),
         (count(*) OVER ())::integer
  FROM filtered f
  LEFT JOIN public.profiles rp ON rp.id = f.reviewer_user_id
  LEFT JOIN public.review_replies rr ON rr.review_id = f.id
  ORDER BY
    CASE WHEN p_sort = 'relevant' THEN
      (CASE WHEN now() - f.created_at <= interval '6 months' THEN 1.5
            WHEN now() - f.created_at <= interval '12 months' THEN 1.2 ELSE 1.0 END)
      + (CASE WHEN char_length(btrim(COALESCE(f.text, ''))) > 60 THEN 0.3 ELSE 0 END)
    END DESC NULLS LAST,
    f.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_reviews(uuid, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_reviews(uuid, text, text, text, integer, integer) TO authenticated;

-- The summary card. average and count are the same numbers the profile shows
-- (member_ratings). would_again_pct needs 3 or more answers; a highlight
-- shows once 2 or more reviewers picked it; the AI text needs 5 reviews.
CREATE OR REPLACE FUNCTION public.get_member_review_summary(p_user uuid, p_side text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rating record;
  v_answers integer;
  v_yes integer;
  v_highlights jsonb;
  v_ai record;
BEGIN
  IF auth.uid() IS NULL OR p_user IS NULL OR p_side NOT IN ('sitter', 'owner') OR public.hidden_by_block(p_user) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_rating FROM public.member_ratings(ARRAY[p_user], p_side);

  SELECT count(*) FILTER (WHERE rf.would_again IS NOT NULL), count(*) FILTER (WHERE rf.would_again IS TRUE)
    INTO v_answers, v_yes
  FROM public.review_facts rf
  WHERE rf.reviewee_user_id = p_user AND rf.side = p_side AND rf.published_at IS NOT NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('key', h.k, 'n', h.n) ORDER BY h.n DESC, h.k), '[]'::jsonb)
    INTO v_highlights
  FROM (
    SELECT x.k, count(*)::integer AS n
    FROM public.review_facts rf, unnest(rf.highlights) AS x(k)
    WHERE rf.reviewee_user_id = p_user AND rf.side = p_side AND rf.published_at IS NOT NULL
    GROUP BY x.k
    HAVING count(*) >= 2
  ) h;

  SELECT s.summary, s.review_count INTO v_ai
  FROM public.review_ai_summaries s
  WHERE s.user_id = p_user AND s.side = p_side AND s.review_count >= 5;

  RETURN jsonb_build_object(
    'average', v_rating.average,
    'count', COALESCE(v_rating.review_count, 0),
    'categories', COALESCE(v_rating.categories, '{}'::jsonb),
    'would_again_pct', CASE WHEN v_answers >= 3 THEN round(v_yes::numeric * 100 / v_answers) END,
    'would_again_answers', v_answers,
    'highlights', v_highlights,
    'ai_summary', CASE WHEN COALESCE(v_rating.review_count, 0) >= 5 THEN v_ai.summary END,
    'ai_review_count', CASE WHEN COALESCE(v_rating.review_count, 0) >= 5 THEN v_ai.review_count END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_review_summary(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_review_summary(uuid, text) TO authenticated;

-- 5m. Notification types for the new review messages.
CREATE OR REPLACE FUNCTION public.notification_category(p_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_type IN ('new_message', 'phone_shared') THEN 'messages'
    WHEN p_type IN ('new_application', 'application_status', 'application_withdrawn', 'invite') THEN 'applications'
    WHEN p_type IN ('sit_checkin', 'sit_checkin_reminder', 'sit_started', 'sit_update_loved', 'guide_unlocked',
                    'guide_nudge', 'guide_access_missing', 'arrival_vault_prompt', 'sit_story_ready',
                    'sit_story_ready_sitter', 'sit_story_portfolio_request') THEN 'sits'
    WHEN p_type IN ('review', 'review_reminder', 'reviews_published', 'review_reply') THEN 'reviews'
    WHEN p_type = 'city_chat_thread_reply' THEN 'city_chat'
    WHEN p_type = 'membership' THEN 'membership'
    WHEN p_type IN ('sit_cancelled', 'sit_reschedule_proposed', 'sit_reschedule_accepted', 'sit_reschedule_declined',
                    'listing_dates_changed', 'listing_dates_removed', 'id_verification_status',
                    'id_verification_approved', 'id_verification_rejected', 'membership_payment_failed',
                    'reliability_strike', 'community_strike_heads_up_host', 'community_strike_heads_up_nomad',
                    'safety_alert') THEN 'always'
    ELSE 'other'
  END;
$$;


-- ─── 6. Profile privacy ────────────────────────────────────────────────────
-- Replaces "Authenticated users can view profiles" USING (true). A member can
-- read a profiles row (still only the granted safe columns) for: themselves,
-- admins, and, when they are not blocked either way, discoverable members and
-- members they share something with (a conversation, an application, an
-- invitation, a sit, a City Chat room they are both in, or a review between
-- them). Across a block, chats, Settings and reviews get first names through
-- their own server functions. The helper takes the row's id column; it never
-- looks the row itself up.
CREATE OR REPLACE FUNCTION public.profile_visible_to_me(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    p_id = auth.uid()
    OR public.is_admin_user(auth.uid())
    OR (NOT public.hidden_by_block(p_id) AND (
    public.profile_is_discoverable(p_id)
    OR EXISTS (SELECT 1 FROM public.conversations c
               WHERE (c.owner_user_id = auth.uid() AND c.sitter_user_id = p_id)
                  OR (c.owner_user_id = p_id AND c.sitter_user_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.sits s
               WHERE (s.owner_user_id = auth.uid() AND s.sitter_user_id = p_id)
                  OR (s.owner_user_id = p_id AND s.sitter_user_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.applications a JOIN public.listings l ON l.id = a.listing_id
               WHERE (a.sitter_user_id = auth.uid() AND l.owner_user_id = p_id)
                  OR (a.sitter_user_id = p_id AND l.owner_user_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.sitter_invites i
               WHERE (i.owner_user_id = auth.uid() AND i.sitter_user_id = p_id)
                  OR (i.owner_user_id = p_id AND i.sitter_user_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.reviews r
               WHERE (r.reviewer_user_id = auth.uid() AND r.reviewee_user_id = p_id)
                  OR (r.reviewer_user_id = p_id AND r.reviewee_user_id = auth.uid()))
    OR EXISTS (
      -- A City Chat room both can open now (a live sit in that city).
      SELECT 1
      FROM public.sits s1
      JOIN public.listings l1 ON l1.id = s1.listing_id
      JOIN public.sit_dates d1 ON d1.id = s1.sit_dates_id
      JOIN public.listings l2 ON public.city_chat_key(l2.city, l2.country) = public.city_chat_key(l1.city, l1.country)
      JOIN public.sits s2 ON s2.listing_id = l2.id
      JOIN public.sit_dates d2 ON d2.id = s2.sit_dates_id
      WHERE s1.sitter_user_id = auth.uid() AND s1.status IN ('confirmed', 'in_progress') AND d1.end_date >= current_date
        AND s2.sitter_user_id = p_id AND s2.status IN ('confirmed', 'in_progress') AND d2.end_date >= current_date
    )
    ))
  );
$$;

REVOKE ALL ON FUNCTION public.profile_visible_to_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_visible_to_me(uuid) TO authenticated, service_role;

DO $$
DECLARE
  r record;
BEGIN
  -- Every permissive SELECT policy that lets anyone read any profile.
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd IN ('SELECT', 'ALL')
      AND permissive = 'PERMISSIVE'
      AND (btrim(COALESCE(qual, '')) IN ('true', '(true)') OR policyname = 'Authenticated users can view profiles')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', r.policyname);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Members see profiles they may see" ON public.profiles;
CREATE POLICY "Members see profiles they may see" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.profile_visible_to_me(id));

-- City Chat names: first name and photo of people who wrote in a room the
-- member can open now (someone who wrote there may no longer have a sit in
-- that city). Never across a block.
CREATE OR REPLACE FUNCTION public.get_city_chat_senders(p_room_id uuid, p_user_ids uuid[])
RETURNS TABLE (id uuid, first_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, NULLIF(btrim(p.first_name), ''), p.avatar_url
  FROM public.profiles p
  WHERE p.id = ANY (p_user_ids[1:200])
    AND public.can_access_city_chat(p_room_id, auth.uid())
    AND EXISTS (SELECT 1 FROM public.city_chat_messages m WHERE m.room_id = p_room_id AND m.sender_user_id = p.id)
    AND NOT public.is_blocked_with(p.id);
$$;

REVOKE ALL ON FUNCTION public.get_city_chat_senders(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_city_chat_senders(uuid, uuid[]) TO authenticated;


-- ─── 7. Existing functions that learn about blocks and the one rating ──────

-- Applicants: a pending application across a block is paused like a lapsed
-- one; ratings come from member_ratings.
CREATE OR REPLACE FUNCTION public.get_listing_applicants(p_listing_id uuid)
RETURNS TABLE (
  application_id uuid,
  sit_dates_id uuid,
  start_date date,
  end_date date,
  status public.application_status,
  created_at timestamptz,
  owner_seen boolean,
  message text,
  who_applying text,
  highlights text[],
  sitter_user_id uuid,
  first_name text,
  avatar_url text,
  city text,
  country text,
  founding_member boolean,
  id_verified boolean,
  pet_types text[],
  review_count integer,
  avg_rating numeric,
  review_rate integer,
  fit_total_nights integer,
  fit_free_nights integer,
  fit_free_from date,
  fit_free_to date,
  fit_pets_known text[],
  fit_pets_missing text[],
  fit_meds_ok boolean,
  fit_same_city boolean,
  sit_id uuid,
  sit_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_city text;
  v_pet_types text[];
  v_meds boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '28000';
  END IF;

  SELECT l.owner_user_id, NULLIF(lower(btrim(l.city)), '') INTO v_owner, v_city
  FROM public.listings l WHERE l.id = p_listing_id;
  IF NOT FOUND OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'Listing not found.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT public.canonical_pet_type(pt.type)) FILTER (
           WHERE public.canonical_pet_type(pt.type) NOT IN ('', 'other')), ARRAY[]::text[]),
         COALESCE(bool_or(pt.requires_medication IS TRUE OR pt.has_medication IS TRUE), false)
    INTO v_pet_types, v_meds
  FROM public.pets pt WHERE pt.listing_id = p_listing_id;

  RETURN QUERY
  WITH apps AS (
    SELECT a.*, sd.start_date AS sd_start, sd.end_date AS sd_end
    FROM public.applications a
    JOIN public.sit_dates sd ON sd.id = a.sit_dates_id
    WHERE a.listing_id = p_listing_id
      -- Paused: a pending application from a Nomad without Nomad access is
      -- hidden until they have a membership again.
      -- Blocked either way: paused the same way, back after an unblock.
      AND (a.status NOT IN ('applied', 'shortlisted')
           OR (public.has_side_access(a.sitter_user_id, 'sitter') AND NOT public.blocked_between(a.sitter_user_id, v_uid)))
  ),
  nomads AS (
    SELECT DISTINCT apps.sitter_user_id AS uid FROM apps
  ),
  rates AS (
    SELECT r.user_id, r.review_rate
    FROM public.member_review_rates(ARRAY(SELECT uid FROM nomads)) r
  ),
  -- The same rating as everywhere else (published reviews as a Nomad).
  revs AS (
    SELECT mr.user_id AS uid, mr.review_count AS n, mr.average AS avg
    FROM public.member_ratings(ARRAY(SELECT uid FROM nomads), 'sitter') mr
  ),
  -- Nights of each application's range the Nomad has marked free (and isn't
  -- booked elsewhere), only for Nomads who keep a calendar at all.
  nights AS (
    SELECT apps.id AS app_id, d::date AS night,
           EXISTS (
             SELECT 1 FROM public.sitter_availability av
             WHERE av.sitter_user_id = apps.sitter_user_id
               AND d::date BETWEEN av.start_date AND av.end_date
           )
           AND NOT EXISTS (
             SELECT 1 FROM public.sits s
             LEFT JOIN public.sit_dates bsd ON bsd.id = s.sit_dates_id
             WHERE s.sitter_user_id = apps.sitter_user_id
               AND s.status IN ('confirmed', 'in_progress')
               AND s.listing_id IS DISTINCT FROM p_listing_id
               AND d::date BETWEEN COALESCE(bsd.start_date, s.snapshot_start_date)
                               AND COALESCE(bsd.end_date, s.snapshot_end_date)
           ) AS free
    FROM apps
    CROSS JOIN LATERAL generate_series(apps.sd_start, GREATEST(apps.sd_end - 1, apps.sd_start), interval '1 day') d
    WHERE EXISTS (SELECT 1 FROM public.sitter_availability av2 WHERE av2.sitter_user_id = apps.sitter_user_id)
  ),
  fit AS (
    SELECT app_id,
           COUNT(*)::integer AS total,
           COUNT(*) FILTER (WHERE free)::integer AS free_n,
           MIN(night) FILTER (WHERE free) AS free_from,
           MAX(night) FILTER (WHERE free) AS free_to
    FROM nights GROUP BY app_id
  )
  SELECT
    apps.id,
    apps.sit_dates_id,
    apps.sd_start,
    apps.sd_end,
    apps.status,
    apps.created_at,
    (apps.owner_seen_at IS NOT NULL),
    apps.message,
    apps.who_applying,
    apps.highlights,
    apps.sitter_user_id,
    NULLIF(btrim(p.first_name), ''),
    p.avatar_url,
    p.city,
    p.country,
    COALESCE(p.founding_member, false),
    -- The real result of the ID check, not the sitter_profiles copy.
    COALESCE(p.id_verified, false),
    COALESCE(sp.pet_types, ARRAY[]::text[]),
    COALESCE(revs.n, 0),
    revs.avg,
    rates.review_rate,
    GREATEST(apps.sd_end - apps.sd_start, 1)::integer,
    fit.free_n,
    fit.free_from,
    CASE WHEN fit.free_to IS NULL THEN NULL ELSE fit.free_to + 1 END,
    ARRAY(
      SELECT t FROM unnest(v_pet_types) t
      WHERE t = ANY (ARRAY(SELECT public.canonical_pet_type(x) FROM unnest(COALESCE(sp.pet_types, ARRAY[]::text[])) x))
    ),
    ARRAY(
      SELECT t FROM unnest(v_pet_types) t
      WHERE NOT (t = ANY (ARRAY(SELECT public.canonical_pet_type(x) FROM unnest(COALESCE(sp.pet_types, ARRAY[]::text[])) x)))
    ),
    CASE WHEN v_meds THEN 'Pets with medication' = ANY (COALESCE(sp.comfortable_with, ARRAY[]::text[])) ELSE NULL END,
    (v_city IS NOT NULL AND lower(btrim(COALESCE(p.city, ''))) = v_city),
    st.id,
    st.status::text
  FROM apps
  LEFT JOIN public.profiles p ON p.id = apps.sitter_user_id
  LEFT JOIN public.sitter_profiles sp ON sp.user_id = apps.sitter_user_id
  LEFT JOIN revs ON revs.uid = apps.sitter_user_id
  LEFT JOIN rates ON rates.user_id = apps.sitter_user_id
  LEFT JOIN fit ON fit.app_id = apps.id
  -- The sit this application turned into (only for accepted ones), newest first.
  LEFT JOIN LATERAL (
    SELECT s.id, s.status
    FROM public.sits s
    WHERE apps.status = 'accepted'
      AND s.listing_id = apps.listing_id
      AND s.sitter_user_id = apps.sitter_user_id
      AND (s.sit_dates_id = apps.sit_dates_id
           OR (s.sit_dates_id IS NULL AND s.snapshot_start_date = apps.sd_start AND s.snapshot_end_date = apps.sd_end))
    ORDER BY s.created_at DESC
    LIMIT 1
  ) st ON true
  ORDER BY apps.sd_start, apps.created_at DESC;
END;
$$;

-- Chats stay listed (old messages stay). i_blocked shows the blocker's
-- banner and Unblock; chat_closed closes the composer for both.
DROP FUNCTION IF EXISTS public.get_conversation_partners();
CREATE FUNCTION public.get_conversation_partners()
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
  unread_count integer,
  i_blocked boolean,
  chat_closed boolean
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
      WHERE m.conversation_id = c.id AND m.read_at IS NULL AND m.sender_user_id <> c.uid),
    -- Only the blocker learns about their own block. The other member just
    -- sees a closed chat, the same as any closed chat.
    EXISTS (SELECT 1 FROM public.member_blocks mb WHERE mb.blocker_id = c.uid AND mb.blocked_id = c.other_id),
    public.hidden_by_block(c.other_id)
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

-- Inviting someone across a block gets the same neutral answer as inviting
-- a Nomad without Nomad access. It never says why.
CREATE OR REPLACE FUNCTION public.require_owner_access_to_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.request_is_end_user() AND NOT public.has_side_access(NEW.owner_user_id, 'owner') THEN
    RAISE EXCEPTION 'You need a Pet Parent membership to invite Nomads.'
      USING ERRCODE = '42501', HINT = 'membership_needed';
  END IF;
  IF public.request_is_end_user() AND (NOT public.has_side_access(NEW.sitter_user_id, 'sitter')
                                       OR public.blocked_between(NEW.owner_user_id, NEW.sitter_user_id)) THEN
    RAISE EXCEPTION 'This Nomad isn''t available for invitations right now.'
      USING ERRCODE = '42501', HINT = 'nomad_unavailable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_owner_access_to_invite() FROM PUBLIC, anon, authenticated;
