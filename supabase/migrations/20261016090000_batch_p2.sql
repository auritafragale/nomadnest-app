-- Batch P2: perks placements and the Trip pass.
--
-- 1. perks.short_title (up to 30 characters; "{country}" and "{city}" are
--    filled in on the member's device from their own sit).
-- 2. perk_clicks.placement: where a click came from ('perks_page',
--    'sit_confirmed', 'sit_upcoming', 'sit_now', 'dashboard', 'menu').
--    perk-redirect stores only that value (no page path, no sit). Earlier
--    clicks all came from the perks page.
-- 3. get_member_perks also returns short_title (members only, as before;
--    never the code, link or subid). The result type changes, so the
--    function is dropped and created again with the same grants.
-- 4. admin_save_perk saves short_title; admin_perk_click_stats adds clicks
--    by placement (result type changes: dropped and created again).
-- 5. perk-logos storage policies: only admins can upload, replace or delete;
--    files must be .png, .webp, .svg, .jpg or .jpeg. The bucket itself (public,
--    512 KB) is created through Lovable's Storage settings, not here.
-- No new member or visitor access to perks or perk_clicks.

-- ── 1. Short title ──────────────────────────────────────────────────────
ALTER TABLE public.perks ADD COLUMN IF NOT EXISTS short_title text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perks_short_title_length_check') THEN
    ALTER TABLE public.perks ADD CONSTRAINT perks_short_title_length_check CHECK (short_title IS NULL OR char_length(short_title) <= 30);
  END IF;
END;
$$;
-- The new column gets no member or visitor privilege (P1 revoked everything
-- on perks; a new column inherits nothing). Make sure.
REVOKE ALL (short_title) ON public.perks FROM PUBLIC, anon, authenticated;

-- ── 2. Where clicks come from ───────────────────────────────────────────
ALTER TABLE public.perk_clicks ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'perks_page';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perk_clicks_placement_check') THEN
    ALTER TABLE public.perk_clicks ADD CONSTRAINT perk_clicks_placement_check
      CHECK (placement IN ('perks_page', 'sit_confirmed', 'sit_upcoming', 'sit_now', 'dashboard', 'menu'));
  END IF;
END;
$$;
REVOKE ALL (placement) ON public.perk_clicks FROM PUBLIC, anon;

-- ── 3. The member list, with short_title ────────────────────────────────
DROP FUNCTION IF EXISTS public.get_member_perks();
CREATE FUNCTION public.get_member_perks()
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
  short_title text,
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
         p.short_title,
         NULLIF(btrim(COALESCE(p.discount_code, '')), '') IS NOT NULL,
         EXISTS (SELECT 1 FROM public.perk_clicks c WHERE c.perk_id = p.id AND c.user_id = v_uid)
  FROM public.perks p
  WHERE p.is_active AND (p.expires_at IS NULL OR p.expires_at >= CURRENT_DATE)
  ORDER BY p.sort_order, p.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_perks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_perks() TO authenticated, service_role;

-- ── 4a. Admin save, with short_title ────────────────────────────────────
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
    short_title      = CASE WHEN j ? 'short_title' THEN NULLIF(btrim(j->>'short_title'), '') ELSE p.short_title END,
    updated_at       = now()
  WHERE p.id = v_id;

  RETURN v_id;
END;
$$;

-- ── 4b. Click stats by placement ────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_perk_click_stats();
CREATE FUNCTION public.admin_perk_click_stats()
RETURNS TABLE (perk_id uuid, total_clicks bigint, clicks_30d bigint, by_placement jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
    SELECT p.id,
           COUNT(c.id)::bigint,
           COUNT(c.id) FILTER (WHERE c.clicked_at > now() - INTERVAL '30 days')::bigint,
           COALESCE((SELECT jsonb_object_agg(x.placement, x.n)
                     FROM (SELECT c2.placement, count(*) AS n FROM public.perk_clicks c2
                           WHERE c2.perk_id = p.id GROUP BY c2.placement) x), '{}'::jsonb)
    FROM public.perks p
    LEFT JOIN public.perk_clicks c ON c.perk_id = p.id
    GROUP BY p.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_perk_click_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_perk_click_stats() TO authenticated, service_role;

-- ── 5. perk-logos: admins write, image files only ───────────────────────
DROP POLICY IF EXISTS "Admins upload perk logos" ON storage.objects;
CREATE POLICY "Admins upload perk logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'perk-logos'
    AND public.is_admin_user(auth.uid())
    AND lower(storage.extension(name)) IN ('png', 'webp', 'svg', 'jpg', 'jpeg')
  );

DROP POLICY IF EXISTS "Admins replace perk logos" ON storage.objects;
CREATE POLICY "Admins replace perk logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'perk-logos' AND public.is_admin_user(auth.uid()))
  WITH CHECK (
    bucket_id = 'perk-logos'
    AND public.is_admin_user(auth.uid())
    AND lower(storage.extension(name)) IN ('png', 'webp', 'svg', 'jpg', 'jpeg')
  );

DROP POLICY IF EXISTS "Admins delete perk logos" ON storage.objects;
CREATE POLICY "Admins delete perk logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'perk-logos' AND public.is_admin_user(auth.uid()));

-- Admins list the folder (the uploader replaces files); everyone else reads
-- logos through the public bucket URL.
DROP POLICY IF EXISTS "Admins list perk logos" ON storage.objects;
CREATE POLICY "Admins list perk logos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'perk-logos' AND public.is_admin_user(auth.uid()));
