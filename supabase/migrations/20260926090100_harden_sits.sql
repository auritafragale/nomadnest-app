-- ═══════════════════════════════════════════════════════════════════════════
-- Security hardening: sits
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The upcoming handbook unlocks access details based on a sit's sitter and
-- dates, so neither participant may reassign or re-point a sit from the app.
--
-- 1. UPDATE policy: participants only, checked on the new row too.
-- 2. BEFORE UPDATE guard (app writes only): owner_user_id, sitter_user_id,
--    listing_id, sit_dates_id, created_at, confirmed_at, completed_at and
--    arrival_prompt_sent_at can't change. Status can only stay the same or go
--    confirmed/in_progress -> cancelled (the one status change the app makes;
--    the owner or the sitter may cancel). On that transition the guard itself
--    sets cancelled_at and cancelled_from_status; otherwise those can't change,
--    so nobody can fake an early cancellation to unlock a review.
-- 3. INSERT policy: the owner must own the listing, the date range must belong
--    to it, status must be 'confirmed', and the sitter must already have an
--    accepted application for that date range (the accept flow sets the
--    application to 'accepted' before inserting the sit).
-- 4. anon loses all table privileges; nobody can DELETE sits from the app.
--
-- HOW APP WRITES ARE DETECTED: guard_sit_update is SECURITY INVOKER and
-- checks current_user. Direct API writes run as 'authenticated' (or 'anon').
-- Not restricted:
--   * edge functions (service_role): review-reminders completing sits,
--     send-arrival-vault-prompt setting arrival_prompt_sent_at;
--   * SECURITY DEFINER functions, which run as their owner:
--     advance_sit_statuses (confirmed -> in_progress -> completed) and
--     respond_to_sit_reschedule, which updates sits.sit_dates_id after the
--     sitter accepts new dates.
--
-- Trigger order: BEFORE triggers fire alphabetically, so guard_sit_update runs
-- before set_sit_cancellation_metadata; both set the same cancellation values.


-- ─── 1. UPDATE policy ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Participants can update sits" ON public.sits;
CREATE POLICY "Participants can update sits"
ON public.sits
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_user_id OR auth.uid() = sitter_user_id)
WITH CHECK (auth.uid() = owner_user_id OR auth.uid() = sitter_user_id);


-- ─── 2. UPDATE guard ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_sit_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Only direct app writes are restricted (see header).
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR NEW.sitter_user_id IS DISTINCT FROM OLD.sitter_user_id
     OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.sit_dates_id IS DISTINCT FROM OLD.sit_dates_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
     OR NEW.arrival_prompt_sent_at IS DISTINCT FROM OLD.arrival_prompt_sent_at THEN
    RAISE EXCEPTION 'Sits can''t be edited this way'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' AND OLD.status IN ('confirmed', 'in_progress') THEN
      NEW.cancelled_at := now();
      NEW.cancelled_from_status := OLD.status;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'This sit status change isn''t allowed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
     OR NEW.cancelled_from_status IS DISTINCT FROM OLD.cancelled_from_status THEN
    RAISE EXCEPTION 'Cancellation details can''t be edited'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_sit_update ON public.sits;
CREATE TRIGGER guard_sit_update
BEFORE UPDATE ON public.sits
FOR EACH ROW EXECUTE FUNCTION public.guard_sit_update();


-- ─── 3. INSERT policy ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Owners can insert sits" ON public.sits;
CREATE POLICY "Owners can insert sits"
ON public.sits
FOR INSERT
TO authenticated
WITH CHECK (
  owner_user_id = auth.uid()
  AND status = 'confirmed'::public.sit_status
  AND EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = sits.listing_id AND l.owner_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.sit_dates sd
    WHERE sd.id = sits.sit_dates_id AND sd.listing_id = sits.listing_id
  )
  AND EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.listing_id = sits.listing_id
      AND a.sit_dates_id = sits.sit_dates_id
      AND a.sitter_user_id = sits.sitter_user_id
      AND a.status = 'accepted'::public.application_status
  )
);


-- ─── 4. Grants ──────────────────────────────────────────────────────────────

REVOKE ALL ON public.sits FROM anon;
REVOKE DELETE, TRUNCATE ON public.sits FROM authenticated;
