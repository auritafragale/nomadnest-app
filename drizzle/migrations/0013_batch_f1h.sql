-- Batch F1h: City Chat rooms never hold a home's exact location.
--
-- On live, ensure_city_chat_room_for_sit copied listings.latitude/longitude
-- (the exact home location, which members can't read on listings) into
-- city_chat_rooms, which every signed-in member can read. The New Delhi room
-- sat exactly on a home.
--
-- Rounding the approximate location (approx_*, a random point within 500 m
-- of the home) to 2 decimals is not enough on its own: on live it would put
-- the New Delhi room 92 m and 429 m from the two homes there. So a room keeps
-- a rounded point only when it is at least 1 km from every home's exact
-- location, and has no coordinates otherwise. Nothing in the app or the
-- database reads room coordinates today (checked), so rooms without them
-- work as before.
--
-- 1. nn_distance_m: distance in metres between two points (internal).
-- 2. guard_city_chat_room_location (BEFORE INSERT/UPDATE on rooms): rounds to
--    2 decimals, and clears the point if it is within 1 km of any home.
-- 3. clear_room_locations_near_home (AFTER INSERT/UPDATE OF the exact
--    location on listings): clears any room point within 1 km of that home,
--    so the rule still holds when a home is added or moved later.
-- 4. ensure_city_chat_room_for_sit: uses round(approx_*, 2), never
--    listings.latitude/longitude. Same definer, search_path and grants.
-- 5. Repair: every room's point is round(approx, 2) of a listing with the
--    same city_key, or NULL; the guard then clears any within 1 km of a home.
--
-- Sweep (every function, trigger and view on live that reads a listing's
-- latitude, longitude or address_private): only this trigger copied it into
-- another table. get_listing_exact_location, get_listing_private_address and
-- get_sitter_guide return it to the owner or the confirmed Nomad only;
-- set_listing_approx_location derives the approximate point;
-- request_listing_timezone sends it to the listing-timezone edge function,
-- which looks the time zone up offline and stores only the zone name;
-- export_account_data returns a member's own listing to that member. No
-- notification, email or push carries it.

-- ── 1. Distance helper ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nn_distance_m(p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 6371000 * 2 * asin(least(1, sqrt(
    power(sin(radians((p_lat2 - p_lat1)::double precision) / 2), 2)
    + cos(radians(p_lat1::double precision)) * cos(radians(p_lat2::double precision))
      * power(sin(radians((p_lng2 - p_lng1)::double precision) / 2), 2))));
$$;

REVOKE ALL ON FUNCTION public.nn_distance_m(numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;

-- ── 2. Rooms: rounded, and never within 1 km of a home ───────────────────
CREATE OR REPLACE FUNCTION public.guard_city_chat_room_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    NEW.latitude := NULL;
    NEW.longitude := NULL;
    RETURN NEW;
  END IF;
  NEW.latitude := round(NEW.latitude::numeric, 2);
  NEW.longitude := round(NEW.longitude::numeric, 2);
  IF EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.latitude IS NOT NULL AND l.longitude IS NOT NULL
      AND abs(l.latitude - NEW.latitude) < 0.05
      AND public.nn_distance_m(l.latitude, l.longitude, NEW.latitude, NEW.longitude) < 1000
  ) THEN
    NEW.latitude := NULL;
    NEW.longitude := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_city_chat_room_location() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_city_chat_room_location ON public.city_chat_rooms;
CREATE TRIGGER guard_city_chat_room_location
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.city_chat_rooms
  FOR EACH ROW EXECUTE FUNCTION public.guard_city_chat_room_location();

-- ── 3. A home added or moved: clear any room point within 1 km of it ────
CREATE OR REPLACE FUNCTION public.clear_room_locations_near_home()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE public.city_chat_rooms r
  SET latitude = NULL, longitude = NULL
  WHERE r.latitude IS NOT NULL AND r.longitude IS NOT NULL
    AND abs(r.latitude - NEW.latitude) < 0.05
    AND public.nn_distance_m(r.latitude, r.longitude, NEW.latitude, NEW.longitude) < 1000;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_room_locations_near_home() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS clear_room_locations_near_home ON public.listings;
CREATE TRIGGER clear_room_locations_near_home
  AFTER INSERT OR UPDATE OF latitude, longitude ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.clear_room_locations_near_home();

-- ── 4. New rooms from a confirmed sit: the approximate point only ───────
CREATE OR REPLACE FUNCTION public.ensure_city_chat_room_for_sit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Never the exact home location: the approximate point, rounded (the
  -- room guard also clears it if it is within 1 km of any home).
  INSERT INTO public.city_chat_rooms (city, country, city_key, latitude, longitude)
  VALUES (
    btrim(v_listing.city),
    btrim(v_listing.country),
    public.city_chat_key(v_listing.city, v_listing.country),
    round(v_listing.approx_latitude::numeric, 2),
    round(v_listing.approx_longitude::numeric, 2)
  )
  ON CONFLICT (city_key) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ── 5. Repair the existing rooms ────────────────────────────────────────
UPDATE public.city_chat_rooms r
SET (latitude, longitude) = (
  SELECT round(l.approx_latitude::numeric, 2), round(l.approx_longitude::numeric, 2)
  FROM public.listings l
  WHERE public.city_chat_key(l.city, l.country) = r.city_key
    AND l.approx_latitude IS NOT NULL AND l.approx_longitude IS NOT NULL
  ORDER BY l.created_at
  LIMIT 1
);