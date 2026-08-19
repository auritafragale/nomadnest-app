-- Helper: active membership check
CREATE OR REPLACE FUNCTION public.is_active_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND (
        p.founding_member = true
        OR (p.membership_status = 'active' AND (p.membership_expiry IS NULL OR p.membership_expiry > now()))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_admin = true);
$$;

CREATE TABLE public.perks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'other',
  benefit_short text NOT NULL,
  description text,
  affiliate_url text NOT NULL,
  logo_url text,
  discount_code text,
  terms text,
  expires_at date,
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  subid_param text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Non-secret columns are readable by everyone; discount_code / affiliate_url are NOT granted to clients.
GRANT SELECT (id, name, slug, category, benefit_short, description, logo_url, terms, expires_at, is_active, is_featured, sort_order, created_at, updated_at) ON public.perks TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.perks TO authenticated;
GRANT ALL ON public.perks TO service_role;

ALTER TABLE public.perks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active perks"
  ON public.perks FOR SELECT TO anon, authenticated
  USING (is_active = true AND (expires_at IS NULL OR expires_at >= CURRENT_DATE));

CREATE POLICY "Admins can view all perks"
  ON public.perks FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Admins can insert perks"
  ON public.perks FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user(auth.uid()));

CREATE POLICY "Admins can update perks"
  ON public.perks FOR UPDATE TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

CREATE POLICY "Admins can delete perks"
  ON public.perks FOR DELETE TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE TRIGGER update_perks_updated_at
  BEFORE UPDATE ON public.perks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.perk_clicks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  perk_id uuid NOT NULL REFERENCES public.perks(id) ON DELETE CASCADE,
  user_id uuid,
  referrer text,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX perk_clicks_perk_id_idx ON public.perk_clicks(perk_id);
CREATE INDEX perk_clicks_clicked_at_idx ON public.perk_clicks(clicked_at);

GRANT SELECT ON public.perk_clicks TO authenticated;
GRANT ALL ON public.perk_clicks TO service_role;

ALTER TABLE public.perk_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view perk clicks"
  ON public.perk_clicks FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));

-- Members can fetch the discount code for an active perk
CREATE OR REPLACE FUNCTION public.get_perk_discount_code(p_slug text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_member(auth.uid()) THEN
    RAISE EXCEPTION 'Membership required';
  END IF;

  SELECT discount_code INTO v_code
  FROM public.perks
  WHERE slug = p_slug
    AND is_active = true
    AND (expires_at IS NULL OR expires_at >= CURRENT_DATE);

  RETURN v_code;
END;
$$;

-- Admin: full perk rows including secrets
CREATE OR REPLACE FUNCTION public.admin_list_perks()
RETURNS SETOF public.perks
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY SELECT * FROM public.perks ORDER BY sort_order ASC, name ASC;
END;
$$;

-- Admin: click stats per perk
CREATE OR REPLACE FUNCTION public.admin_perk_click_stats()
RETURNS TABLE (perk_id uuid, total_clicks bigint, clicks_30d bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
    SELECT p.id,
           COUNT(c.id)::bigint,
           COUNT(c.id) FILTER (WHERE c.clicked_at > now() - INTERVAL '30 days')::bigint
    FROM public.perks p
    LEFT JOIN public.perk_clicks c ON c.perk_id = p.id
    GROUP BY p.id;
END;
$$;