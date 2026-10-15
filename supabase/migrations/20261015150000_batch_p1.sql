-- Batch P1: Member perks redesign.
--
-- RULE: perks are for paying or Founding members only. A non-member, or
-- someone signed out, never receives a perk's link, code, subid or benefit
-- text from the server.
--
-- On live before this batch: "Anyone can view active perks" plus a
-- table-level SELECT let visitors and members read every column, including
-- discount_code, affiliate_url and subid_param; get_perk_discount_code used
-- is_active_member. (Batch F1g fixed part of this; this migration is
-- complete on its own and safe to apply before or after it.)
--
-- 1. New columns: trip_moment, benefit_headline, benefit_subline,
--    is_perk_of_month (one at a time), spotlight_text, picked_for_sits.
--    trip_moment is backfilled for the five live partners. No benefit
--    amounts are invented.
-- 2. No direct access to public.perks for visitors or members: every table
--    and column privilege is revoked from PUBLIC, anon and authenticated and
--    the public SELECT policy is dropped. All reads go through definer
--    functions; admins read with admin_list_perks (as today) and write with
--    admin_save_perk / admin_delete_perk (a direct UPDATE or DELETE ... WHERE
--    id = ... needs SELECT on id, which members no longer have).
-- 3. get_perks_preview(): anyone; six safe columns only.
--    get_member_perks(): members on either side (has_side_access covers
--    Founding and the 8-day past-due grace); display fields, has_code and
--    used_by_me; never the code, link or subid.
--    get_perk_discount_code(): the same has_side_access rule.
--    get_my_next_sit_for_perks(): the caller's own next sit only, members only.
-- Links still go through the perk-redirect edge function, codes through
-- get_perk_discount_code. No new tracking: used_by_me reads the existing
-- perk_clicks log (user_id), for the caller only.

-- ── 1. New columns ───────────────────────────────────────────────────────
ALTER TABLE public.perks
  ADD COLUMN IF NOT EXISTS trip_moment text NOT NULL DEFAULT 'road',
  ADD COLUMN IF NOT EXISTS benefit_headline text,
  ADD COLUMN IF NOT EXISTS benefit_subline text,
  ADD COLUMN IF NOT EXISTS is_perk_of_month boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS spotlight_text text,
  ADD COLUMN IF NOT EXISTS picked_for_sits boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perks_trip_moment_check') THEN
    ALTER TABLE public.perks ADD CONSTRAINT perks_trip_moment_check CHECK (trip_moment IN ('before', 'road', 'sit'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perks_benefit_lengths_check') THEN
    ALTER TABLE public.perks ADD CONSTRAINT perks_benefit_lengths_check CHECK (
      (benefit_headline IS NULL OR char_length(benefit_headline) <= 40)
      AND (benefit_subline IS NULL OR char_length(benefit_subline) <= 80)
      AND (spotlight_text IS NULL OR char_length(spotlight_text) <= 160));
  END IF;
  -- "$" or "£" only with an amount: no placeholders like "Get $ OFF".
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perks_benefit_headline_amount_check') THEN
    ALTER TABLE public.perks ADD CONSTRAINT perks_benefit_headline_amount_check CHECK (
      benefit_headline IS NULL OR benefit_headline !~ '[$£]' OR benefit_headline ~ '[0-9]');
  END IF;
END;
$$;

-- Only one Perk of the month at a time.
CREATE UNIQUE INDEX IF NOT EXISTS perks_one_perk_of_month ON public.perks ((true)) WHERE is_perk_of_month;

UPDATE public.perks SET trip_moment = 'before' WHERE slug IN ('safetywing', 'nomad-esim', 'surfshark-vpn');
UPDATE public.perks SET trip_moment = 'road' WHERE slug IN ('stasher', 'getyourguide');

-- ── 2. No direct access for visitors or members ─────────────────────────
DROP POLICY IF EXISTS "Anyone can view active perks" ON public.perks;
REVOKE ALL ON public.perks FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  c record;
BEGIN
  -- Column-level grants survive a table-level REVOKE; remove them one by one.
  FOR c IN SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'perks' LOOP
    EXECUTE format('REVOKE ALL (%I) ON public.perks FROM PUBLIC, anon, authenticated', c.column_name);
  END LOOP;
END;
$$;

-- ── 3a. The locked preview: anyone, six safe columns ────────────────────
CREATE OR REPLACE FUNCTION public.get_perks_preview()
RETURNS TABLE (id uuid, name text, logo_url text, category text, trip_moment text, sort_order integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.logo_url, p.category, p.trip_moment, p.sort_order
  FROM public.perks p
  WHERE p.is_active AND (p.expires_at IS NULL OR p.expires_at >= CURRENT_DATE)
  ORDER BY p.sort_order, p.name;
$$;

REVOKE ALL ON FUNCTION public.get_perks_preview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_perks_preview() TO anon, authenticated, service_role;

-- ── 3b. The member list: members on either side ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_member_perks()
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  logo_url text,
  category text,
  trip_moment text,
  sort_order integer,
  description text,
  terms text,
  expires_at date,
  benefit_headline text,
  benefit_subline text,
  is_perk_of_month boolean,
  spotlight_text text,
  picked_for_sits boolean,
  has_code boolean,
  used_by_me boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL
     OR NOT (public.has_side_access(v_uid, 'sitter') OR public.has_side_access(v_uid, 'owner')) THEN
    RAISE EXCEPTION 'Membership required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.slug, p.name, p.logo_url, p.category, p.trip_moment, p.sort_order,
         p.description, p.terms, p.expires_at,
         p.benefit_headline, p.benefit_subline, p.is_perk_of_month, p.spotlight_text, p.picked_for_sits,
         NULLIF(btrim(COALESCE(p.discount_code, '')), '') IS NOT NULL,
         EXISTS (SELECT 1 FROM public.perk_clicks c WHERE c.perk_id = p.id AND c.user_id = v_uid)
  FROM public.perks p
  WHERE p.is_active AND (p.expires_at IS NULL OR p.expires_at >= CURRENT_DATE)
  ORDER BY p.sort_order, p.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_perks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_perks() TO authenticated, service_role;

-- ── 3c. The code: the same membership rule ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_perk_discount_code(p_slug text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.has_side_access(auth.uid(), 'sitter') OR public.has_side_access(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'Membership required';
  END IF;

  SELECT discount_code INTO v_code
  FROM public.perks
  WHERE slug = p_slug
    AND is_active = true
    AND (expires_at IS NULL OR expires_at >= CURRENT_DATE);

  RETURN v_code;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_perk_discount_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_perk_discount_code(text) TO authenticated, service_role;

-- ── 3d. The caller's own next sit (for "Picked for your next sit") ──────
-- Nomads: their next confirmed sit. Pet Parents: their next confirmed sit
-- with a Nomad. Nothing about anyone else; nothing for non-members.
CREATE OR REPLACE FUNCTION public.get_my_next_sit_for_perks()
RETURNS TABLE (city text, country text, start_date date, end_date date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL
     OR NOT (public.has_side_access(v_uid, 'sitter') OR public.has_side_access(v_uid, 'owner')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT COALESCE(NULLIF(btrim(s.snapshot_city), ''), l.city)::text,
         l.country::text,
         COALESCE(sd.start_date, s.snapshot_start_date),
         COALESCE(sd.end_date, s.snapshot_end_date)
  FROM public.sits s
  LEFT JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
  LEFT JOIN public.listings l ON l.id = s.listing_id
  WHERE s.status = 'confirmed'
    AND (s.sitter_user_id = v_uid OR (s.owner_user_id = v_uid AND s.sitter_user_id IS NOT NULL))
    AND COALESCE(sd.start_date, s.snapshot_start_date) >= CURRENT_DATE
  ORDER BY COALESCE(sd.start_date, s.snapshot_start_date)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_next_sit_for_perks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_next_sit_for_perks() TO authenticated, service_role;

-- ── 4. Admin writes ─────────────────────────────────────────────────────
-- Save (insert when p_id is null, else update the keys present in p_perk).
-- Turning on Perk of the month turns the old one off.
CREATE OR REPLACE FUNCTION public.admin_save_perk(p_id uuid, p_perk jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := p_id;
  j jsonb := COALESCE(p_perk, '{}'::jsonb);
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
  END IF;

  IF (j->>'is_perk_of_month')::boolean IS TRUE THEN
    UPDATE public.perks SET is_perk_of_month = false WHERE is_perk_of_month AND id IS DISTINCT FROM v_id;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.perks (name, slug, category, benefit_short, affiliate_url)
    VALUES (j->>'name', j->>'slug', COALESCE(NULLIF(j->>'category', ''), 'other'), COALESCE(j->>'benefit_short', ''), j->>'affiliate_url')
    RETURNING public.perks.id INTO v_id;
  END IF;

  UPDATE public.perks p SET
    name             = CASE WHEN j ? 'name' THEN j->>'name' ELSE p.name END,
    slug             = CASE WHEN j ? 'slug' THEN j->>'slug' ELSE p.slug END,
    category         = CASE WHEN j ? 'category' THEN j->>'category' ELSE p.category END,
    benefit_short    = CASE WHEN j ? 'benefit_short' THEN COALESCE(j->>'benefit_short', '') ELSE p.benefit_short END,
    description      = CASE WHEN j ? 'description' THEN NULLIF(j->>'description', '') ELSE p.description END,
    affiliate_url    = CASE WHEN j ? 'affiliate_url' THEN j->>'affiliate_url' ELSE p.affiliate_url END,
    logo_url         = CASE WHEN j ? 'logo_url' THEN NULLIF(j->>'logo_url', '') ELSE p.logo_url END,
    discount_code    = CASE WHEN j ? 'discount_code' THEN NULLIF(j->>'discount_code', '') ELSE p.discount_code END,
    terms            = CASE WHEN j ? 'terms' THEN NULLIF(j->>'terms', '') ELSE p.terms END,
    expires_at       = CASE WHEN j ? 'expires_at' THEN NULLIF(j->>'expires_at', '')::date ELSE p.expires_at END,
    is_active        = CASE WHEN j ? 'is_active' THEN (j->>'is_active')::boolean ELSE p.is_active END,
    is_featured      = CASE WHEN j ? 'is_featured' THEN (j->>'is_featured')::boolean ELSE p.is_featured END,
    sort_order       = CASE WHEN j ? 'sort_order' THEN (j->>'sort_order')::integer ELSE p.sort_order END,
    subid_param      = CASE WHEN j ? 'subid_param' THEN NULLIF(j->>'subid_param', '') ELSE p.subid_param END,
    trip_moment      = CASE WHEN j ? 'trip_moment' THEN j->>'trip_moment' ELSE p.trip_moment END,
    benefit_headline = CASE WHEN j ? 'benefit_headline' THEN NULLIF(btrim(j->>'benefit_headline'), '') ELSE p.benefit_headline END,
    benefit_subline  = CASE WHEN j ? 'benefit_subline' THEN NULLIF(btrim(j->>'benefit_subline'), '') ELSE p.benefit_subline END,
    is_perk_of_month = CASE WHEN j ? 'is_perk_of_month' THEN (j->>'is_perk_of_month')::boolean ELSE p.is_perk_of_month END,
    spotlight_text   = CASE WHEN j ? 'spotlight_text' THEN NULLIF(btrim(j->>'spotlight_text'), '') ELSE p.spotlight_text END,
    picked_for_sits  = CASE WHEN j ? 'picked_for_sits' THEN (j->>'picked_for_sits')::boolean ELSE p.picked_for_sits END,
    updated_at       = now()
  WHERE p.id = v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_perk(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_perk(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_perk(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.perks WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_perk(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_perk(uuid) TO authenticated, service_role;
