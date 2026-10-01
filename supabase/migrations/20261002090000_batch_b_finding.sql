-- Batch B (finding each other).
--
-- 1. Two AI flags, both off (admins can use the features while off):
--    ai_nomad_match_enabled ("Best match for your sit" on Browse Nomads) and
--    ai_invite_cowriter_enabled ("Help me write it" in the invitation panel).
-- 2. public_founding_spots(): the founding-member cap and the spots left,
--    for the home page, Membership and Onboarding. Only two integers; no
--    codes, no members.
-- 3. nomad_match_cache: the nomad-match edge function's results per listing,
--    kept for 24 hours. Server only (no member or anon access). Rows go when
--    the listing goes (and so when the owner deletes their account). Holds
--    Nomad ids with a score and a one-line reason built from public profile
--    fields only; it is not part of export-my-data because it describes other
--    members, and it expires after a day.

-- ─── 1. Flags ──────────────────────────────────────────────────────────────

INSERT INTO public.app_settings (key, value)
VALUES ('ai_nomad_match_enabled', 'false'::jsonb), ('ai_invite_cowriter_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─── 2. Founding spots ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.public_founding_spots()
RETURNS TABLE (spots_left integer, cap integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH c AS (
    SELECT COALESCE(SUM(max_uses), 0)::integer AS cap
    FROM public.founding_member_codes
    WHERE active
  ), m AS (
    SELECT count(*)::integer AS members FROM public.profiles WHERE founding_member IS TRUE
  )
  SELECT GREATEST(c.cap - m.members, 0)::integer AS spots_left, c.cap
  FROM c, m;
$$;
REVOKE ALL ON FUNCTION public.public_founding_spots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_founding_spots() TO anon, authenticated, service_role;

-- ─── 3. Nomad match cache ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nomad_match_cache (
  listing_id    uuid PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  results       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nomad_match_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nomad_match_cache FROM anon, authenticated;
GRANT ALL ON public.nomad_match_cache TO service_role;
