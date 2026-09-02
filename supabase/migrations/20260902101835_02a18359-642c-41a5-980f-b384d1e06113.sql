-- Members can no longer include `phone` in a client-side upsert because the
-- column is deliberately not readable through the Data API. Provide a
-- security-definer setter for the caller's OWN row instead.
CREATE OR REPLACE FUNCTION public.set_my_profile_phone(p_target text, p_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_target = 'sitter' THEN
    UPDATE public.sitter_profiles SET phone = NULLIF(btrim(coalesce(p_phone, '')), '')
    WHERE user_id = auth.uid();
  ELSIF p_target = 'owner' THEN
    UPDATE public.owner_profiles SET phone = NULLIF(btrim(coalesce(p_phone, '')), '')
    WHERE user_id = auth.uid();
  ELSE
    RAISE EXCEPTION 'Invalid target';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_profile_phone(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_profile_phone(text, text) TO authenticated;

-- Founder dashboard: active memberships = paying members only.
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS TABLE(pending_verifications bigint, total_members bigint, active_members bigint, founding_members bigint, published_listings bigint, open_sit_dates bigint, active_perks bigint, founding_code_used integer, founding_code_max integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
    (SELECT COUNT(*) FROM public.profiles
       WHERE membership_status = 'active'
         AND COALESCE(founding_member, false) = false
         AND (membership_expiry IS NULL OR membership_expiry > now())),
    (SELECT COUNT(*) FROM public.profiles WHERE founding_member = true),
    (SELECT COUNT(*) FROM public.listings WHERE status = 'published'),
    (SELECT COUNT(*) FROM public.sit_dates WHERE status = 'open'),
    (SELECT COUNT(*) FROM public.perks WHERE is_active = true),
    (SELECT COALESCE(SUM(used_count), 0)::integer FROM public.founding_member_codes WHERE active = true),
    (SELECT COALESCE(SUM(max_uses), 0)::integer FROM public.founding_member_codes WHERE active = true);
END;
$$;