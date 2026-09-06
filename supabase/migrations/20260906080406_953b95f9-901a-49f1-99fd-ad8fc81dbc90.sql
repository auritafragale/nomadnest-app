CREATE OR REPLACE FUNCTION public.ensure_city_chat_room_for_sit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.listings%ROWTYPE;
BEGIN
  IF NEW.status NOT IN ('confirmed', 'in_progress') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.listing_id IS NOT DISTINCT FROM NEW.listing_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_listing
  FROM public.listings
  WHERE id = NEW.listing_id;

  IF v_listing.city IS NULL OR btrim(v_listing.city) = ''
     OR v_listing.country IS NULL OR btrim(v_listing.country) = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.city_chat_rooms (city, country, city_key, latitude, longitude)
  VALUES (
    btrim(v_listing.city),
    btrim(v_listing.country),
    public.city_chat_key(v_listing.city, v_listing.country),
    v_listing.latitude,
    v_listing.longitude
  )
  ON CONFLICT (city_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_city_chat_room_for_sit ON public.sits;
CREATE TRIGGER ensure_city_chat_room_for_sit
AFTER INSERT OR UPDATE OF status, listing_id ON public.sits
FOR EACH ROW
EXECUTE FUNCTION public.ensure_city_chat_room_for_sit();