-- Batch F1d: request_is_end_user() answers false, not NULL, with no token.
--
-- With no JWT at all (a database job, a migration, the SQL editor), the old
-- expression compared NULL with 'authenticated' and returned NULL. Callers
-- written as "IF NOT request_is_end_user() THEN RETURN NEW" then ran their
-- member checks against a caller with no uid: guard_manual_id_verification
-- refused a server insert with "Please sign in.", and guard_report_insert
-- dropped conversation_id from a server insert. Wrapped in COALESCE, no token
-- now means "the server", as it already did for callers written as
-- "IF request_is_end_user() AND ...".
--
-- Callers (each checked: members see no change; service_role sees no
-- change; no token now behaves like service_role):
--   guard_manual_id_verification, guard_report_insert,
--   guard_sitter_invite_update, guard_user_roles,
--   prevent_privilege_escalation, require_nomad_access_to_apply,
--   require_owner_access_to_invite, review_before_insert.
--
-- The ID bucket's allowed file types are NOT set here: Lovable's migration
-- tool rejects storage.buckets writes. They are a separate Storage step.

CREATE OR REPLACE FUNCTION public.request_is_end_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    ) = 'authenticated',
    false
  );
$$;

-- Same grants as before: only definer functions and triggers call it.
REVOKE EXECUTE ON FUNCTION public.request_is_end_user() FROM PUBLIC, anon, authenticated;