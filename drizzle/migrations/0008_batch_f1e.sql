-- Batch F1e: a sit moved to new dates takes its application with it.
--
-- respond_to_sit_reschedule (accept) moved the sit to a new booked range but
-- left the accepted application, and the invitation it came from, on the old
-- range. The old range could then be reopened, showing an "accepted"
-- application with no sit, while the booked range had no Nomad's name.
--
-- 1. close_moved_sit_dates(range): the old range is deleted when nothing
--    refers to it (no application, invitation, sit or guide-unlock row), and
--    otherwise set to 'closed', the status the app already uses for ranges
--    no longer offered (Browse, the listing page, Apply and Invite list only
--    'open' ranges; Edit listing hides closed ones from F1e on).
-- 2. guard_sitter_invite_update: unchanged, except that it lets a trusted
--    server routine move an invitation (a transaction-local flag, the same
--    pattern as app.trusted_membership_update).
-- 3. respond_to_sit_reschedule: on accept, the sit's accepted application and
--    the Nomad's "applied" invitation move to the new range, and the old
--    range is closed as in 1. The function is otherwise as it is on live
--    (same definer, search_path and grants).
--
-- The one-time repair of sits already moved is a separate migration
-- (20261014220100_batch_f1e_repair.sql), applied only after its preview
-- (supabase/checks/batch_f1e_repair_preview.sql) has been reviewed on live.
-- No member-written text goes into any notification. Moving a row changes no
-- status, so no alert is sent beyond the existing "New dates accepted".

-- ── 1. Close a range that a sit has moved away from ──────────────────────
CREATE OR REPLACE FUNCTION public.close_moved_sit_dates(p_sit_dates_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_sit_dates_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.applications WHERE sit_dates_id = p_sit_dates_id)
     AND NOT EXISTS (SELECT 1 FROM public.sitter_invites WHERE sit_dates_id = p_sit_dates_id)
     AND NOT EXISTS (SELECT 1 FROM public.sits WHERE sit_dates_id = p_sit_dates_id)
     AND NOT EXISTS (SELECT 1 FROM public.guide_unlock_notifications WHERE sit_dates_id = p_sit_dates_id) THEN
    DELETE FROM public.sit_dates WHERE id = p_sit_dates_id;
  ELSE
    UPDATE public.sit_dates SET status = 'closed'
    WHERE id = p_sit_dates_id AND status IS DISTINCT FROM 'closed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.close_moved_sit_dates(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. The invitation guard lets a trusted move through ──────────────────
CREATE OR REPLACE FUNCTION public.guard_sitter_invite_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.request_is_end_user() OR auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM OLD.sitter_user_id THEN
    RETURN NEW;
  END IF;
  -- F1e: respond_to_sit_reschedule moves the invitation with the sit. It sets
  -- this flag for its own transaction only; members can't set it.
  IF coalesce(current_setting('app.trusted_invite_move', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'You can only answer this invitation.' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = OLD.status
     OR (OLD.status = 'pending' AND NEW.status = 'viewed')
     OR (OLD.status IN ('pending', 'viewed') AND NEW.status = 'declined')
     -- Undo a decline (the Invitations page offers it today).
     OR (OLD.status = 'declined' AND NEW.status = 'viewed')
     OR (OLD.status IN ('pending', 'viewed') AND NEW.status = 'applied'
         AND EXISTS (SELECT 1 FROM public.applications a
                     WHERE a.sitter_user_id = OLD.sitter_user_id AND a.sit_dates_id = OLD.sit_dates_id
                       AND a.status IN ('applied', 'shortlisted', 'accepted'))) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'That change to the invitation is not allowed.' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_sitter_invite_update() FROM PUBLIC, anon, authenticated;

-- ── 3. Accepting new dates moves the application with the sit ────────────
CREATE OR REPLACE FUNCTION public.respond_to_sit_reschedule(p_request_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.sit_reschedule_requests;
  v_sit public.sits;
  v_old_dates public.sit_dates;
  v_new_dates_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_request FROM public.sit_reschedule_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reschedule request not found';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been responded to';
  END IF;

  SELECT * INTO v_sit FROM public.sits WHERE id = v_request.sit_id FOR UPDATE;
  IF NOT FOUND OR v_sit.sitter_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the sit''s Nomad can respond to this request';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.sit_reschedule_requests
    SET status = 'declined', responded_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('status', 'declined');
  END IF;

  SELECT * INTO v_old_dates FROM public.sit_dates WHERE id = v_sit.sit_dates_id;

  INSERT INTO public.sit_dates (listing_id, start_date, end_date, flexibility, handover_preference, status)
  VALUES (
    v_old_dates.listing_id,
    v_request.proposed_start_date,
    v_request.proposed_end_date,
    v_old_dates.flexibility,
    v_old_dates.handover_preference,
    'booked'
  )
  RETURNING id INTO v_new_dates_id;

  UPDATE public.sits SET sit_dates_id = v_new_dates_id WHERE id = v_sit.id;

  -- F1e: the sit's accepted application, and the invitation it came from,
  -- move with it. Only the range changes, so no alert is sent.
  IF v_old_dates.id IS NOT NULL THEN
    UPDATE public.applications SET sit_dates_id = v_new_dates_id
    WHERE sit_dates_id = v_old_dates.id AND sitter_user_id = v_sit.sitter_user_id AND status = 'accepted';

    PERFORM set_config('app.trusted_invite_move', 'on', true);
    UPDATE public.sitter_invites SET sit_dates_id = v_new_dates_id
    WHERE sit_dates_id = v_old_dates.id AND sitter_user_id = v_sit.sitter_user_id AND status = 'applied';
    PERFORM set_config('app.trusted_invite_move', '', true);

    -- The old range is no longer offered: deleted if nothing refers to it,
    -- otherwise closed.
    PERFORM public.close_moved_sit_dates(v_old_dates.id);
  END IF;

  UPDATE public.sit_reschedule_requests
  SET status = 'accepted', responded_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('status', 'accepted', 'new_sit_dates_id', v_new_dates_id);
END;
$function$;
