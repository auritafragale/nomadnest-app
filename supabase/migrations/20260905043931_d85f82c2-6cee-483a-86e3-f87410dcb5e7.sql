CREATE OR REPLACE FUNCTION public.admin_list_community_strikes()
RETURNS TABLE(
  id uuid,
  subject_type text,
  subject_id uuid,
  subject_user_id uuid,
  subject_name text,
  listing_title text,
  category text,
  flag_count integer,
  strike_two_email_sent_at timestamp with time zone,
  show_strike_three_warning boolean,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN QUERY
  SELECT cs.id, cs.subject_type, cs.subject_id, cs.subject_user_id,
         btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
         l.title,
         cs.category, cs.flag_count, cs.strike_two_email_sent_at,
         cs.show_strike_three_warning, cs.updated_at
  FROM public.community_strikes cs
  LEFT JOIN public.profiles p ON p.id = cs.subject_user_id
  LEFT JOIN public.listings l ON l.id = cs.subject_id AND cs.subject_type = 'listing'
  ORDER BY cs.flag_count DESC, cs.updated_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_community_strikes() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_community_strikes() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_reliability_reviews()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  reliability_score integer,
  strike_count bigint,
  last_strike_at timestamp with time zone
)
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
         btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
         p.email,
         p.reliability_score,
         COUNT(cs.id),
         MAX(cs.created_at)
  FROM public.profiles p
  LEFT JOIN public.cancellation_strikes cs ON cs.user_id = p.id
  WHERE p.flagged_for_admin_review = true
  GROUP BY p.id, p.first_name, p.last_name, p.email, p.reliability_score
  ORDER BY p.reliability_score ASC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_reliability_reviews() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_reliability_reviews() TO authenticated;