CREATE OR REPLACE FUNCTION public.city_chat_nomad_count(p_room_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT s.sitter_user_id)::integer
  FROM public.city_chat_rooms r
  JOIN public.sits s ON true
  JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
  JOIN public.listings l ON l.id = s.listing_id
  WHERE r.id = p_room_id
    AND s.status IN ('confirmed', 'in_progress')
    AND sd.end_date >= CURRENT_DATE
    AND LOWER(TRIM(l.city)) = LOWER(TRIM(r.city));
$$;

GRANT EXECUTE ON FUNCTION public.city_chat_nomad_count(uuid) TO authenticated;