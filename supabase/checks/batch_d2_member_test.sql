-- Batch D2: behaviour test, acting as real members.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Needs: a non-admin member with a Nomad profile who is not a Founding
-- member, a non-admin member with no listing (the test gives them a
-- temporary one), and a third non-admin member.
-- Test data: the title "D2 test listing 2099", messages "D2 test 2099 …",
-- the founding codes D2TEST2099A / D2TEST2099B, so the leftover check can
-- prove nothing stayed.
-- Server-side updates of profiles clear the request claims first, or
-- prevent_privilege_escalation (correctly) refuses them.

DO $$
DECLARE
  v_owner uuid;
  v_nomad uuid;
  v_other uuid;
  v_listing uuid;
  v_conv uuid;
  v_n integer;
  v_txt text;
  v_bool boolean;
  v_failed boolean;
  v_role text;
BEGIN
  -- ── Members ────────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT sp.user_id INTO v_nomad
  FROM public.sitter_profiles sp JOIN public.profiles p ON p.id = sp.user_id
  WHERE p.is_admin IS NOT TRUE AND p.founding_member IS NOT TRUE
  ORDER BY p.created_at LIMIT 1;

  SELECT p.id INTO v_owner FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE AND p.id <> v_nomad
    AND NOT EXISTS (SELECT 1 FROM public.listings l WHERE l.owner_user_id = p.id)
  ORDER BY p.created_at LIMIT 1;

  SELECT p.id INTO v_other FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE AND p.id NOT IN (v_owner, v_nomad)
  ORDER BY p.created_at LIMIT 1;

  IF v_nomad IS NULL OR v_owner IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs a non-admin, non-founding Nomad, a non-admin member with no listing and a third non-admin member';
  END IF;

  -- ── Test data (as the server) ──────────────────────────────────────────
  INSERT INTO public.listings (owner_user_id, title, status, city, country, owner_declaration_accepted_at)
  VALUES (v_owner, 'D2 test listing 2099', 'published', 'Testville', 'Testland', now())
  RETURNING id INTO v_listing;
  INSERT INTO public.owner_profiles (user_id, is_active) VALUES (v_owner, true)
  ON CONFLICT (user_id) DO UPDATE SET is_active = true;
  INSERT INTO public.conversations (listing_id, owner_user_id, sitter_user_id, conversation_type)
  VALUES (v_listing, v_owner, v_nomad, 'listing') RETURNING id INTO v_conv;

  -- ── 1. A message creates one new_message for the other member only ─────
  INSERT INTO public.messages (conversation_id, sender_user_id, body)
  VALUES (v_conv, v_nomad, 'D2 test 2099 secret-words-here');
  SELECT count(*) INTO v_n FROM public.notifications
  WHERE type = 'new_message' AND data->>'conversation_id' = v_conv::text AND user_id = v_owner;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: expected one new_message for the other member, got %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications
  WHERE type = 'new_message' AND data->>'conversation_id' = v_conv::text AND user_id = v_nomad;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the sender was notified of their own message'; END IF;
  SELECT count(*) INTO v_n FROM public.notifications
  WHERE data->>'conversation_id' = v_conv::text
    AND (title || ' ' || message || ' ' || COALESCE(data::text, '')) ILIKE '%secret-words-here%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a notification holds the message text'; END IF;
  SELECT title INTO v_txt FROM public.notifications
  WHERE type = 'new_message' AND data->>'conversation_id' = v_conv::text AND user_id = v_owner;
  IF v_txt NOT LIKE 'New message from % about D2 test listing 2099' THEN
    RAISE EXCEPTION 'FAIL: unexpected new_message title: %', v_txt;
  END IF;

  -- ── 2. Phone-share markers don't create new_message ────────────────────
  INSERT INTO public.messages (conversation_id, sender_user_id, body)
  VALUES (v_conv, v_nomad, '[[phone_share]]{"action":"shared"}');
  SELECT count(*) INTO v_n FROM public.notifications
  WHERE type = 'new_message' AND data->>'conversation_id' = v_conv::text;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: a phone-share marker created a new_message'; END IF;

  -- ── 3. Push and email choices; always-on types ignore them ─────────────
  INSERT INTO public.notification_preferences (user_id, push_messages, email_messages, message_email_frequency, email_membership, push_sits)
  VALUES (v_owner, false, true, 'daily', true, false)
  ON CONFLICT (user_id) DO UPDATE SET push_messages = false, email_messages = true, message_email_frequency = 'daily',
                                      email_membership = true, push_sits = false;
  IF public.notification_allowed(v_owner, 'new_message', 'push') THEN RAISE EXCEPTION 'FAIL: push for messages was off but allowed'; END IF;
  IF public.notification_allowed(v_owner, 'new_message', 'email') THEN RAISE EXCEPTION 'FAIL: a daily member got an instant message email'; END IF;
  IF public.notification_allowed(v_owner, 'sit_checkin', 'push') THEN RAISE EXCEPTION 'FAIL: push for sits was off but allowed'; END IF;
  IF NOT public.notification_allowed(v_owner, 'sit_cancelled', 'push') THEN RAISE EXCEPTION 'FAIL: an always-on push was blocked'; END IF;
  IF NOT public.notification_allowed(v_owner, 'membership_payment_failed', 'email') THEN RAISE EXCEPTION 'FAIL: an always-on email was blocked'; END IF;
  IF public.notification_allowed(v_owner, 'membership', 'push') THEN RAISE EXCEPTION 'FAIL: membership pushed (email only)'; END IF;
  IF public.notification_allowed(v_owner, 'city_chat_thread_reply', 'email') THEN RAISE EXCEPTION 'FAIL: City Chat replies emailed (push only)'; END IF;
  IF NOT public.notification_allowed(v_other, 'new_message', 'push') THEN RAISE EXCEPTION 'FAIL: a member with no row did not get defaults'; END IF;

  -- ── 4. The digest: daily members, unread messages only ─────────────────
  -- (Counted against the owner's own total, which may include real unread
  -- messages from other chats.)
  UPDATE public.notification_preferences SET message_digest_sent_at = NULL WHERE user_id = v_owner;
  SELECT message_count INTO v_n FROM public.message_digest_due(true) WHERE user_id = v_owner;
  IF COALESCE(v_n, 0) < 1 THEN RAISE EXCEPTION 'FAIL: the digest missed an unread message'; END IF;
  INSERT INTO public.messages (conversation_id, sender_user_id, body, read_at)
  VALUES (v_conv, v_nomad, 'D2 test 2099 already read', now());
  SELECT message_count - v_n INTO v_n FROM public.message_digest_due(true) WHERE user_id = v_owner;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the digest counted a message already read'; END IF;
  SELECT count(*) INTO v_n FROM public.message_digest_due(true) WHERE user_id = v_nomad;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the digest picked a member who is not on daily emails'; END IF;
  PERFORM public.mark_message_digest_sent(ARRAY[v_owner]);
  SELECT count(*) INTO v_n FROM public.message_digest_due(true) WHERE user_id = v_owner;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the digest would be sent twice'; END IF;

  -- ── 5. Own notification choices only ───────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.notification_preferences (user_id, push_reviews) VALUES (v_nomad, false)
  ON CONFLICT (user_id) DO UPDATE SET push_reviews = false;
  SELECT count(*) INTO v_n FROM public.notification_preferences WHERE user_id = v_owner;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a member read someone else''s notification choices'; END IF;
  UPDATE public.notification_preferences SET push_messages = true WHERE user_id = v_owner;
  v_failed := false;
  BEGIN
    INSERT INTO public.notification_preferences (user_id) VALUES (v_other);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member created notification choices for someone else'; END IF;
  v_failed := false;
  BEGIN
    UPDATE public.notification_preferences SET message_digest_sent_at = now() WHERE user_id = v_nomad;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member wrote the server-only digest time'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT push_messages INTO v_bool FROM public.notification_preferences WHERE user_id = v_owner;
  IF v_bool THEN RAISE EXCEPTION 'FAIL: a member changed someone else''s notification choices'; END IF;

  -- ── 6. A hidden Nomad and a paused listing are not public ──────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.sitter_profiles SET is_visible = false WHERE user_id = v_nomad;
  RESET ROLE;
  SELECT is_active INTO v_bool FROM public.sitter_profiles WHERE user_id = v_nomad;
  IF v_bool IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL: hiding the Nomad profile did not also set is_active false'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.owner_profiles SET is_active = false WHERE user_id = v_owner;
  SELECT count(*) INTO v_n FROM public.listings WHERE id = v_listing;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the owner could no longer see their own paused listing'; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.sitter_profiles WHERE user_id = v_nomad;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: another member could read a hidden Nomad profile'; END IF;
  SELECT count(*) INTO v_n FROM public.listings WHERE id = v_listing;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: another member could read a paused listing'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_n FROM public.listings WHERE id = v_listing;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a signed-out visitor could read a paused listing'; END IF;
  RESET ROLE;

  -- ── 7. Members can't set their own membership, roles or founding ───────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_failed := false;
  BEGIN
    UPDATE public.profiles SET membership_type = 'combined', membership_status = 'active' WHERE id = v_nomad;
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member changed their own membership'; END IF;
  v_failed := false;
  BEGIN
    UPDATE public.profiles SET founding_member = true WHERE id = v_nomad;
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member made themselves a Founding member'; END IF;
  v_failed := false;
  BEGIN
    UPDATE public.profiles SET stripe_subscription_id = 'sub_fake' WHERE id = v_nomad;
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member changed their own billing ids'; END IF;
  v_failed := false;
  BEGIN
    UPDATE public.user_roles SET role = 'both' WHERE user_id = v_nomad;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member changed their own role'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.redeem_founding_member_code('D2TEST2099A', v_nomad);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member could still redeem a code from the browser'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.redeem_founding_code_for(v_nomad, 'D2TEST2099A');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member could call the server redeem'; END IF;
  RESET ROLE;

  -- ── 8. Redeem once, never a used code; roles follow (as the server) ────
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.founding_member_codes (code, max_uses, used_count, active) VALUES ('D2TEST2099A', 5, 0, true);
  INSERT INTO public.founding_member_codes (code, max_uses, used_count, active) VALUES ('D2TEST2099B', 1, 1, true);
  v_txt := public.redeem_founding_code_for(v_other, 'D2TEST2099B');
  IF v_txt <> 'exhausted' THEN RAISE EXCEPTION 'FAIL: a used-up code gave %', v_txt; END IF;
  v_txt := public.redeem_founding_code_for(v_nomad, 'D2TEST2099A');
  IF v_txt <> 'ok' THEN RAISE EXCEPTION 'FAIL: a valid code gave %', v_txt; END IF;
  v_txt := public.redeem_founding_code_for(v_nomad, 'D2TEST2099A');
  IF v_txt <> 'already' THEN RAISE EXCEPTION 'FAIL: the same member redeemed twice (%)', v_txt; END IF;
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_nomad;
  IF v_role IS NOT NULL AND v_role <> 'both' THEN RAISE EXCEPTION 'FAIL: a Founding member did not get both roles (%)', v_role; END IF;

  -- Combined plan then cancellation: roles follow (as the webhook would).
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_owner;
  IF v_role IS NOT NULL THEN
    UPDATE public.user_roles SET base_role = 'owner', role = 'owner' WHERE user_id = v_owner;
    UPDATE public.profiles SET membership_type = 'combined', membership_status = 'active' WHERE id = v_owner;
    SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_owner;
    IF v_role <> 'both' THEN RAISE EXCEPTION 'FAIL: Combined did not give both roles (%)', v_role; END IF;
    UPDATE public.profiles SET membership_type = NULL, membership_status = 'none' WHERE id = v_owner;
    SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_owner;
    IF v_role <> 'owner' THEN RAISE EXCEPTION 'FAIL: roles did not go back to the base role after the plan ended (%)', v_role; END IF;
  END IF;

  -- ── 9. Tightened grants on the City Chat tables ────────────────────────
  IF has_table_privilege('authenticated', 'public.city_chat_mutes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.city_chat_mutes', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.city_chat_room_reads', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.city_chat_room_reads', 'INSERT')
     OR has_table_privilege('authenticated', 'public.city_chat_room_reads', 'TRUNCATE') THEN
    RAISE EXCEPTION 'FAIL: members still have UPDATE, INSERT or TRUNCATE on the City Chat tables';
  END IF;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;

-- Leftover check (run after the test): every count must be 0.
-- SELECT
--   (SELECT count(*) FROM public.listings WHERE title = 'D2 test listing 2099') AS test_listings,
--   (SELECT count(*) FROM public.messages WHERE body LIKE 'D2 test 2099%') AS test_messages,
--   (SELECT count(*) FROM public.notifications WHERE title LIKE '%D2 test listing 2099%') AS test_notifications,
--   (SELECT count(*) FROM public.founding_member_codes WHERE code LIKE 'D2TEST2099%') AS test_codes,
--   (SELECT count(*) FROM public.founding_redemptions r JOIN public.founding_member_codes c ON c.id = r.code_id
--      WHERE c.code LIKE 'D2TEST2099%') AS test_redemptions;
