-- Batch F1g: perk codes stay private; City Chat rooms only from the server.
--
-- 1. public.perks: "Anyone can view active perks" plus table-level SELECT let
--    visitors and members read every column, including discount_code,
--    affiliate_url and subid_param. A column-level REVOKE does nothing while a
--    table-level grant exists, so the table grant is replaced by a grant on
--    the public columns only. Members get the code only through
--    get_perk_discount_code and the link only through perk-redirect; admins
--    read everything through admin_list_perks (definer) and keep their
--    INSERT, UPDATE and DELETE (policies unchanged).
-- 2. get_perk_discount_code: membership is has_side_access on either side
--    (Founding, active, or past due within the 8-day grace), the same rule as
--    perk-redirect. Same definer, search_path and grants.
-- 3. city_chat_rooms: members can no longer create rooms. Rooms are created
--    only by ensure_city_chat_room_for_sit (definer). The members' SELECT
--    policy stays.

-- ── 1. Perk columns ──────────────────────────────────────────────────────
REVOKE SELECT ON public.perks FROM PUBLIC, anon, authenticated;
REVOKE SELECT (discount_code, affiliate_url, subid_param) ON public.perks FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, name, slug, category, benefit_short, description, logo_url, terms,
              expires_at, is_active, is_featured, sort_order, created_at, updated_at)
  ON public.perks TO anon, authenticated;

-- ── 2. The discount code, for members on either side ────────────────────
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

-- ── 3. City Chat rooms come only from the server ────────────────────────
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON public.city_chat_rooms;
