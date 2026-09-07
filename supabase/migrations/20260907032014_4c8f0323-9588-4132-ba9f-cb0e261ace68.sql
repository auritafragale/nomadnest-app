-- Grant column-scoped UPDATE on the safe, member-editable profile fields.
-- Protected fields (email, phone, membership_*, onfido_*, is_admin, id_verified, etc.) are
-- intentionally NOT granted and remain blocked by the prevent_privilege_escalation trigger.
GRANT UPDATE (
  avatar_url,
  first_name,
  last_name,
  full_name,
  bio,
  location,
  country,
  city
) ON public.profiles TO authenticated;

-- Grant table-level access on manual_id_verifications so members can submit and view
-- their own ID reviews. RLS policies already restrict to own rows / admin rows.
GRANT SELECT, INSERT ON public.manual_id_verifications TO authenticated;
GRANT ALL ON public.manual_id_verifications TO service_role;