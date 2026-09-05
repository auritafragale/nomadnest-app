DROP VIEW IF EXISTS public.member_review_rates;

CREATE OR REPLACE FUNCTION public.member_review_rates(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, reviews_written integer, sits_attended integer, review_rate integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    COALESCE((SELECT COUNT(*) FROM public.reviews r WHERE r.reviewer_user_id = u.id), 0)::integer,
    COALESCE((
      SELECT COUNT(*) FROM public.sits s
      WHERE s.status = 'completed' AND (s.sitter_user_id = u.id OR s.owner_user_id = u.id)
    ), 0)::integer,
    CASE
      WHEN (SELECT COUNT(*) FROM public.sits s
            WHERE s.status = 'completed' AND (s.sitter_user_id = u.id OR s.owner_user_id = u.id)) = 0
        THEN NULL
      ELSE ROUND(
        (SELECT COUNT(*) FROM public.reviews r WHERE r.reviewer_user_id = u.id)::numeric
        / (SELECT COUNT(*) FROM public.sits s
           WHERE s.status = 'completed' AND (s.sitter_user_id = u.id OR s.owner_user_id = u.id)) * 100
      )::integer
    END
  FROM unnest(p_user_ids) AS u(id)
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.member_review_rates(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_review_rates(uuid[]) TO authenticated, service_role;