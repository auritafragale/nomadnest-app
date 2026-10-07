-- Batch D1: behaviour test, acting as real members.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Needs: a non-admin member with a Nomad profile, a non-admin member with no
-- listing (the test gives them a temporary one), and a third non-admin member.
-- Test data: the title "D1 test listing 2099", the cities Testville/Testland
-- and Testville/Otherland, dates in 2099, the last names Testparent/Testnomad
-- and the numbers +447700900111/+447700900222, so the leftover check can
-- prove nothing stayed.
-- Server-side updates of profiles clear the request claims first, or
-- prevent_privilege_escalation (correctly) refuses them.
-- Emails are never stored, so the email check is that share_my_phone sends
-- none: it only writes the notification row checked below (the proof also
-- checks the function never calls an email function).

DO $$
DECLARE
  v_owner uuid;
  v_nomad uuid;
  v_other uuid;
  v_listing uuid;
  v_range uuid;
  v_conv uuid;
  v_sit uuid;
  v_room uuid;
  v_room_other uuid;
  v_n integer;
  v_txt text;
  v_bool boolean;
  v_failed boolean;
BEGIN
  -- ── Members ────────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT sp.user_id INTO v_nomad
  FROM public.sitter_profiles sp JOIN public.profiles p ON p.id = sp.user_id
  WHERE p.is_admin IS NOT TRUE
  ORDER BY p.created_at LIMIT 1;

  -- An owner who has no listing yet, so the temporary one fits their limit.
  SELECT p.id INTO v_owner FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE AND p.id <> v_nomad
    AND NOT EXISTS (SELECT 1 FROM public.listings l WHERE l.owner_user_id = p.id)
  ORDER BY p.created_at LIMIT 1;

  SELECT p.id INTO v_other FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE AND p.id NOT IN (v_owner, v_nomad)
  ORDER BY p.created_at LIMIT 1;

  IF v_nomad IS NULL OR v_owner IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs a non-admin Nomad, a non-admin member with no listing and a third non-admin member';
  END IF;

  -- ── Test data (as the server) ──────────────────────────────────────────
  UPDATE public.profiles SET last_name = 'Testparent', phone_number = '+447700900111', phone_verified = true WHERE id = v_owner;
  UPDATE public.profiles SET last_name = 'Testnomad', phone_number = '+447700900222', phone_verified = true WHERE id = v_nomad;

  INSERT INTO public.listings (owner_user_id, title, status, city, country, owner_declaration_accepted_at)
  VALUES (v_owner, 'D1 test listing 2099', 'published', 'Testville', 'Testland', now())
  RETURNING id INTO v_listing;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, '2099-03-01', '2099-03-10') RETURNING id INTO v_range;
  INSERT INTO public.conversations (listing_id, owner_user_id, sitter_user_id, conversation_type)
  VALUES (v_listing, v_owner, v_nomad, 'listing') RETURNING id INTO v_conv;
  INSERT INTO public.messages (conversation_id, sender_user_id, body) VALUES (v_conv, v_nomad, 'Hello, D1 test 2099');

  -- ── 1. No sharing before a sit is confirmed ────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_failed := false;
  BEGIN
    PERFORM public.share_my_phone(v_owner);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member shared a phone without a confirmed sit'; END IF;
  RESET ROLE;

  -- A confirmed sit (as the server). This also opens the Testville room.
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.sits (listing_id, sit_dates_id, sitter_user_id, owner_user_id, status, confirmed_at)
  VALUES (v_listing, v_range, v_nomad, v_owner, 'confirmed', now()) RETURNING id INTO v_sit;

  -- ── 2. No sharing without a verified phone ─────────────────────────────
  UPDATE public.profiles SET phone_verified = false WHERE id = v_nomad;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_failed := false;
  BEGIN
    PERFORM public.share_my_phone(v_owner);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member shared a phone that is not verified'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.profiles SET phone_verified = true WHERE id = v_nomad;

  -- ── 3. Share: only the recipient reads it ──────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.share_my_phone(v_owner);
  SELECT their_number INTO v_txt FROM public.get_phone_shares(v_owner);
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FAIL: the sharer saw a number the other member never shared'; END IF;
  v_failed := false;
  BEGIN
    PERFORM 1 FROM public.phone_shares;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member could read phone_shares directly'; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT their_number INTO v_txt FROM public.get_phone_shares(v_nomad);
  IF v_txt IS DISTINCT FROM '+447700900222' THEN RAISE EXCEPTION 'FAIL: the recipient could not read the shared number'; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.get_phone_shares(v_nomad) WHERE their_number IS NOT NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a third member could read the shared number'; END IF;
  RESET ROLE;

  -- ── 4. The number is in no message, notification (push uses the same row) ──
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT count(*) INTO v_n FROM public.messages WHERE body LIKE '%7700900222%' OR body LIKE '%7700900111%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a message contains a phone number'; END IF;
  SELECT count(*) INTO v_n FROM public.notifications
  WHERE (title || ' ' || message || ' ' || COALESCE(data::text, '')) ~ '7700900(111|222)';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a notification contains a phone number'; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND type = 'phone_shared' AND read_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the recipient did not get one phone_shared notification (got %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.messages WHERE conversation_id = v_conv AND body = '[[phone_share]]{"action":"shared"}';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the chat did not get one share marker (got %)', v_n; END IF;

  -- Opening the chat clears its bell notifications.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.mark_conversation_notifications_read(ARRAY[v_conv]);
  RESET ROLE;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND type = 'phone_shared' AND read_at IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: opening the chat did not mark its notification read'; END IF;

  -- ── 5. Stopping hides it ───────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.stop_sharing_my_phone(v_owner);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT their_number, they_are_sharing INTO v_txt, v_bool FROM public.get_phone_shares(v_nomad);
  IF v_txt IS NOT NULL OR v_bool THEN RAISE EXCEPTION 'FAIL: the number still showed after stopping'; END IF;
  RESET ROLE;

  -- ── 6. get_conversation_partners: only your chats, first names only ────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.get_conversation_partners() g
  WHERE g.conversation_id = v_conv AND g.other_user_id = v_owner AND g.sit_status = 'confirmed';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the Nomad did not get their chat with the owner'; END IF;
  SELECT count(*) INTO v_n FROM public.get_conversation_partners() g WHERE row_to_json(g)::text ~* 'Testparent|7700900';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: get_conversation_partners returned a last name or a phone number'; END IF;
  RESET ROLE;

  -- A hidden Nomad's chat still shows for the owner, with their first name.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.sitter_profiles SET is_visible = false WHERE user_id = v_nomad;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.get_conversation_partners() g
  WHERE g.conversation_id = v_conv AND g.other_user_id = v_nomad AND NOT g.member_left AND g.first_name <> 'Former member';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the chat with a hidden Nomad did not show'; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.get_conversation_partners() g
  WHERE g.conversation_id = v_conv
     OR NOT EXISTS (SELECT 1 FROM public.conversations c
                    WHERE c.id = g.conversation_id AND (c.owner_user_id = v_other OR c.sitter_user_id = v_other));
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: get_conversation_partners returned a chat the member is not in'; END IF;
  RESET ROLE;

  -- ── 7. City Chats: city AND country, members with access only ──────────
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT id INTO v_room FROM public.city_chat_rooms WHERE city_key = public.city_chat_key('Testville', 'Testland');
  IF v_room IS NULL THEN RAISE EXCEPTION 'FAIL: confirming the sit did not open a Testville room'; END IF;
  INSERT INTO public.city_chat_rooms (city, country, city_key)
  VALUES ('Testville', 'Otherland', public.city_chat_key('Testville', 'Otherland'))
  RETURNING id INTO v_room_other;
  INSERT INTO public.city_chat_messages (room_id, sender_user_id, content) VALUES (v_room, v_nomad, 'D1 test 2099 hello');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF NOT public.can_access_city_chat(v_room, v_nomad) THEN RAISE EXCEPTION 'FAIL: the Nomad could not open their own city room'; END IF;
  IF public.can_access_city_chat(v_room_other, v_nomad) THEN RAISE EXCEPTION 'FAIL: same city name in another country gave access'; END IF;
  PERFORM public.get_city_chat_catchup_input(v_room, now() - interval '1 day');
  PERFORM public.mark_city_chat_room_read(v_room);
  INSERT INTO public.city_chat_mutes (user_id, room_id) VALUES (v_nomad, v_room);
  SELECT count(*) INTO v_n FROM public.get_my_city_chat_rooms() WHERE room_id = v_room AND has_access AND muted;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the room list did not show the open, muted room'; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.city_chat_messages WHERE room_id = v_room;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a member without access read the city room'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.get_city_chat_catchup_input(v_room, now() - interval '1 day');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member without access got the catch-up input'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.mark_city_chat_room_read(v_room);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member without access marked the room read'; END IF;

  -- ── 8. Mutes and room reads are own rows only ──────────────────────────
  SELECT count(*) INTO v_n FROM public.city_chat_mutes WHERE user_id = v_nomad;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a member could see someone else''s mutes'; END IF;
  SELECT count(*) INTO v_n FROM public.city_chat_room_reads WHERE user_id = v_nomad;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a member could see someone else''s room reads'; END IF;
  v_failed := false;
  BEGIN
    INSERT INTO public.city_chat_mutes (user_id, room_id) VALUES (v_nomad, v_room_other);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member added a mute for someone else'; END IF;
  DELETE FROM public.city_chat_mutes WHERE user_id = v_nomad;
  v_failed := false;
  BEGIN
    INSERT INTO public.city_chat_room_reads (user_id, room_id) VALUES (v_other, v_room);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member wrote a room read directly'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT count(*) INTO v_n FROM public.city_chat_mutes WHERE user_id = v_nomad AND room_id = v_room;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: another member removed the Nomad''s mute'; END IF;

  -- ── 9. A cancelled sit ends the share ──────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.share_my_phone(v_owner);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.sits SET status = 'cancelled', cancelled_at = now() WHERE id = v_sit;
  SELECT count(*) INTO v_n FROM public.phone_shares WHERE sharer_id = v_nomad AND recipient_id = v_owner AND stopped_at IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the share stayed active after the sit was cancelled'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT their_number INTO v_txt FROM public.get_phone_shares(v_nomad);
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FAIL: the number still showed after the sit was cancelled'; END IF;
  RESET ROLE;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;

-- Leftover check (run after the test): every count must be 0.
-- SELECT
--   (SELECT count(*) FROM public.listings WHERE title = 'D1 test listing 2099') AS test_listings,
--   (SELECT count(*) FROM public.sit_dates WHERE start_date >= '2099-01-01') AS test_dates,
--   (SELECT count(*) FROM public.city_chat_rooms WHERE city = 'Testville') AS test_rooms,
--   (SELECT count(*) FROM public.messages WHERE body LIKE '%D1 test 2099%') AS test_messages,
--   (SELECT count(*) FROM public.city_chat_messages WHERE content LIKE '%D1 test 2099%') AS test_city_messages,
--   (SELECT count(*) FROM public.profiles WHERE last_name IN ('Testparent', 'Testnomad')
--      OR phone_number IN ('+447700900111', '+447700900222')) AS test_profiles,
--   (SELECT count(*) FROM public.phone_shares ps JOIN public.sits s ON s.id = ps.sit_id
--      JOIN public.sit_dates d ON d.id = s.sit_dates_id WHERE d.start_date >= '2099-01-01') AS test_shares;
