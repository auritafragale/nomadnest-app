REVOKE ALL ON FUNCTION public.enforce_application_cap() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_application_cap() TO service_role;
REVOKE ALL ON FUNCTION public.advance_sit_statuses() FROM PUBLIC;