-- Public (not signed in) visitors browsing published sits need the host's
-- display info and public review ratings, otherwise cards render nameless.
CREATE POLICY "Public can view basic profile info"
ON public.profiles FOR SELECT TO anon USING (true);

GRANT SELECT (
  id, first_name, last_name, full_name, avatar_url, bio, city, country, location,
  founding_member, id_verified, email_verified, phone_verified, created_at
) ON public.profiles TO anon;

DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;
CREATE POLICY "Anyone can view reviews"
ON public.reviews FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.reviews TO anon;

-- Internal bookkeeping table: no client should reach it at all.
REVOKE ALL ON public.background_job_state FROM anon, authenticated;
GRANT ALL ON public.background_job_state TO service_role;