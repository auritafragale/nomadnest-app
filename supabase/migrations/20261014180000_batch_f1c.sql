-- Batch F1c: invitation answers and re-invites; ID upload safety.
-- DRAFT (work in progress on feat/batch-f1c). Not yet reviewed or tested.
--
-- 1. notify_invite_answered: the Pet Parent hears when a Nomad declines.
-- 2. notification_category: 'invite_declined' joins 'applications'
--    (patched in place from the live definition).
-- 3. One live invitation per range and Nomad (unique partial index).
-- 4. The Nomad may change only an invitation's status, and only along the
--    allowed steps (guard trigger; the update policy is replaced).
-- 5. manual_id_verifications: members can only send pending rows with files
--    in their own folder, and change only the two paths while pending.
-- 6. Members may delete their own unused ID drafts; retention clears
--    unreferenced drafts after 24 hours.
-- The bucket's size limit and file types are NOT set here: Lovable's
-- migration tool rejects storage.buckets writes. They are a separate step.
--
-- No member-written text goes into any notification, push or email.

-- ── 1. Decline alert ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_invite_answered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text;
  v_dates text;
BEGIN
  IF NEW.owner_user_id IS NULL OR NEW.owner_user_id = NEW.sitter_user_id THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(NULLIF(btrim(l.city), ''), 'your home'), public.nn_date_range(sd.start_date, sd.end_date)
    INTO v_city, v_dates
  FROM public.listings l
  LEFT JOIN public.sit_dates sd ON sd.id = NEW.sit_dates_id
  WHERE l.id = NEW.listing_id;

  PERFORM public.notify_member(
    NEW.owner_user_id, 'invite_declined', 'Invitation declined',
    public.nn_first_name(NEW.sitter_user_id, 'Your Nomad') || ' can''t make your sit in '
      || COALESCE(v_city, 'your home') || COALESCE(', ' || v_dates, '') || '.',
    '/dashboard?mode=owner',
    jsonb_build_object('listing_id', NEW.listing_id::text, 'invite_id', NEW.id::text),
    'invite_declined:' || NEW.id::text, 'Invite someone else');
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never block declining.
  RAISE WARNING 'notify_invite_answered skipped for invite % (%)', NEW.id, SQLSTATE;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_invite_answered() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_invite_answered ON public.sitter_invites;
CREATE TRIGGER notify_invite_answered
  AFTER UPDATE OF status ON public.sitter_invites
  FOR EACH ROW
  WHEN (NEW.status = 'declined' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_invite_answered();

-- ── 2. notification_category: patched from the live definition ───────────
DO $patch$
DECLARE
  v_def text := pg_get_functiondef('public.notification_category(text)'::regprocedure);
  v_anchor constant text := '''application_withdrawn'', ''invite'')';
BEGIN
  IF v_def LIKE '%invite_declined%' THEN
    RETURN; -- already there
  END IF;
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'notification_category: expected the applications list ending in ''invite'' exactly once. Nothing was changed.';
  END IF;
  EXECUTE replace(v_def, v_anchor, '''application_withdrawn'', ''invite'', ''invite_declined'')');
END;
$patch$;

-- ── 3. One live invitation per range and Nomad ────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS sitter_invites_one_live_per_range
  ON public.sitter_invites (sit_dates_id, sitter_user_id)
  WHERE status IN ('pending', 'viewed');

-- ── 4. The Nomad changes only the status, along the allowed steps ─────────
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
                       AND a.status IN ('applied', 'shortlisted'))) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'That change to the invitation is not allowed.' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_sitter_invite_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_sitter_invite_update ON public.sitter_invites;
CREATE TRIGGER guard_sitter_invite_update
  BEFORE UPDATE ON public.sitter_invites
  FOR EACH ROW EXECUTE FUNCTION public.guard_sitter_invite_update();

DROP POLICY IF EXISTS "Sitters can update received invites" ON public.sitter_invites;
DROP POLICY IF EXISTS "Sitters can answer received invites" ON public.sitter_invites;
CREATE POLICY "Sitters can answer received invites"
ON public.sitter_invites FOR UPDATE TO authenticated
USING (auth.uid() = sitter_user_id)
WITH CHECK (auth.uid() = sitter_user_id);

-- ── 5. ID verification rows: members send pending rows only ───────────────
CREATE OR REPLACE FUNCTION public.guard_manual_id_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prefix text;
BEGIN
  IF NOT public.request_is_end_user() OR public.is_admin_user(v_uid) THEN
    RETURN NEW; -- the server, admins and admin_decide_id_verification
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in.' USING ERRCODE = '42501';
  END IF;
  v_prefix := v_uid::text || '/';

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM v_uid OR NEW.status IS DISTINCT FROM 'pending'
       OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL
       OR NEW.notes IS NOT NULL OR NEW.documents_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'A new ID check must be pending.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF OLD.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'This ID check has already been reviewed.' USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - 'id_photo_path' - 'selfie_path') IS DISTINCT FROM (to_jsonb(OLD) - 'id_photo_path' - 'selfie_path') THEN
      RAISE EXCEPTION 'You can only replace your documents.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.id_photo_path IS NULL OR NEW.selfie_path IS NULL
     OR left(NEW.id_photo_path, length(v_prefix)) <> v_prefix OR left(NEW.selfie_path, length(v_prefix)) <> v_prefix
     OR position('..' IN NEW.id_photo_path) > 0 OR position('..' IN NEW.selfie_path) > 0 THEN
    RAISE EXCEPTION 'Your documents must be in your own folder.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_manual_id_verification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_manual_id_verification ON public.manual_id_verifications;
CREATE TRIGGER guard_manual_id_verification
  BEFORE INSERT OR UPDATE ON public.manual_id_verifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_manual_id_verification();

-- ── 6. ID drafts: delete your own unused ones; retention after 24 hours ───
-- True when an ID check row references this file. Answers only for the
-- caller's own folder.
CREATE OR REPLACE FUNCTION public.id_document_in_use(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT split_part(p_path, '/', 1) = auth.uid()::text
     AND EXISTS (SELECT 1 FROM public.manual_id_verifications v
                 WHERE v.id_photo_path = p_path OR v.selfie_path = p_path);
$$;

REVOKE ALL ON FUNCTION public.id_document_in_use(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.id_document_in_use(text) TO authenticated;

DROP POLICY IF EXISTS "Members can delete own unused ID drafts" ON storage.objects;
CREATE POLICY "Members can delete own unused ID drafts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'id-verification-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'draft'
  AND NOT public.id_document_in_use(name)
);

-- For privacy-retention: draft files older than 24 hours that no ID check uses.
CREATE OR REPLACE FUNCTION public.expired_id_drafts()
RETURNS TABLE (name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.name FROM storage.objects o
  WHERE o.bucket_id = 'id-verification-documents'
    AND split_part(o.name, '/', 2) = 'draft'
    AND o.created_at < now() - interval '24 hours'
    AND NOT EXISTS (SELECT 1 FROM public.manual_id_verifications v
                    WHERE v.id_photo_path = o.name OR v.selfie_path = o.name)
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.expired_id_drafts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expired_id_drafts() TO service_role;
