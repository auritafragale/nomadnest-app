GRANT SELECT (id_verified) ON public.sitter_profiles TO authenticated;
REVOKE SELECT (phone) ON public.sitter_profiles FROM anon, authenticated;
REVOKE SELECT (phone) ON public.owner_profiles FROM anon, authenticated;