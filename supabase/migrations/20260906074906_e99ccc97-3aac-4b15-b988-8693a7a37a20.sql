CREATE OR REPLACE FUNCTION public.can_access_city_chat(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_city text;
  v_country text;
BEGIN
  SELECT city, country INTO v_city, v_country
  FROM public.city_chat_rooms WHERE id = p_room_id;

  IF v_city IS NULL THEN RETURN false; END IF;

  -- Nomads visible and based in this city can join the chat.
  IF EXISTS (
    SELECT 1 FROM public.sitter_profiles sp
    JOIN public.profiles p ON p.id = sp.user_id
    WHERE sp.user_id = p_user_id
      AND sp.is_visible = true
      AND LOWER(TRIM(p.city)) = LOWER(TRIM(v_city))
  ) THEN
    RETURN true;
  END IF;

  -- Nomads with a confirmed or in-progress sit in this city can join for the whole sit.
  IF EXISTS (
    SELECT 1 FROM public.sits s
    JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
    JOIN public.listings l ON l.id = s.listing_id
    WHERE s.sitter_user_id = p_user_id
      AND s.status IN ('confirmed', 'in_progress')
      AND sd.end_date >= CURRENT_DATE
      AND LOWER(TRIM(l.city)) = LOWER(TRIM(v_city))
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;