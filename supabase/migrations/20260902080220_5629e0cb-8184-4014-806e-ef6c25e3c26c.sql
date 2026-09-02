CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS TABLE(
  pending_verifications bigint,
  total_members bigint,
  active_members bigint,
  founding_members bigint,
  published_listings bigint,
  open_sit_dates bigint,
  active_perks bigint,
  founding_code_used integer,
  founding_code_max integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.manual_id_verifications WHERE status = 'pending'),
    (SELECT COUNT(*) FROM public.profiles),
    (SELECT COUNT(*) FROM public.profiles WHERE membership_status = 'active'),
    (SELECT COUNT(*) FROM public.profiles WHERE founding_member = true),
    (SELECT COUNT(*) FROM public.listings WHERE status = 'published'),
    (SELECT COUNT(*) FROM public.sit_dates WHERE status = 'open'),
    (SELECT COUNT(*) FROM public.perks WHERE is_active = true),
    (SELECT COALESCE(SUM(used_count), 0)::integer FROM public.founding_member_codes WHERE active = true),
    (SELECT COALESCE(SUM(max_uses), 0)::integer FROM public.founding_member_codes WHERE active = true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_members()
RETURNS TABLE(
  id uuid,
  first_name text,
  last_name text,
  email text,
  city text,
  country text,
  role app_role,
  membership_status text,
  membership_type text,
  founding_member boolean,
  id_verified boolean,
  email_verified boolean,
  phone_verified boolean,
  is_admin boolean,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN QUERY
  SELECT p.id, p.first_name, p.last_name, p.email, p.city, p.country,
         ur.role, p.membership_status, p.membership_type, p.founding_member,
         p.id_verified, p.email_verified, p.phone_verified, p.is_admin, p.created_at
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  ORDER BY p.created_at DESC;
END;
$$;