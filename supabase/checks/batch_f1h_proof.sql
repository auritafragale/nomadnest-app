-- Batch F1h: proof that the live database matches 20261015180000_batch_f1h.sql.
-- READ-ONLY. One row per check; every row should have ok = true.
-- Distances use the haversine formula inline (metres), so this file doesn't
-- depend on the migration's own helper.

WITH pairs AS (
  SELECT r.city_key,
         6371000 * 2 * asin(least(1, sqrt(
           power(sin(radians((l.latitude - r.latitude)::double precision) / 2), 2)
           + cos(radians(r.latitude::double precision)) * cos(radians(l.latitude::double precision))
             * power(sin(radians((l.longitude - r.longitude)::double precision) / 2), 2)))) AS m
  FROM public.city_chat_rooms r
  JOIN public.listings l ON l.latitude IS NOT NULL AND l.longitude IS NOT NULL
  WHERE r.latitude IS NOT NULL AND r.longitude IS NOT NULL
)
SELECT 'no City Chat room within 1 km of any home''s exact location' AS item, '0 rooms' AS expected,
       (SELECT count(DISTINCT city_key) FROM pairs WHERE m < 1000)::text || ' rooms' AS actual,
       NOT EXISTS (SELECT 1 FROM pairs WHERE m < 1000) AS ok

UNION ALL
SELECT 'room coordinates are rounded to 2 decimals (or empty)', '0 rooms with more precision',
       count(*)::text || ' rooms',
       count(*) = 0
FROM public.city_chat_rooms
WHERE (latitude IS NULL) <> (longitude IS NULL)
   OR latitude <> round(latitude, 2) OR longitude <> round(longitude, 2)

UNION ALL
SELECT 'ensure_city_chat_room_for_sit never reads the exact location', 'no listings.latitude/longitude; uses approx_*',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE format('exact %s, approx %s', p.prosrc ~* '\m(v_listing|l|listing|listings)\.(latitude|longitude)\M',
                        p.prosrc ~ 'approx_latitude' AND p.prosrc ~ 'approx_longitude') END,
       p.oid IS NOT NULL
         AND p.prosrc !~* '\m(v_listing|l|listing|listings)\.(latitude|longitude)\M'
         AND p.prosrc ~ 'approx_latitude' AND p.prosrc ~ 'approx_longitude'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.ensure_city_chat_room_for_sit()')

UNION ALL
SELECT format('function %s', f.sig), 'search_path=public; no member or visitor access' || CASE WHEN f.definer THEN '; definer' ELSE '' END,
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE format('definer %s, %s, member %s, visitor %s', p.prosecdef, COALESCE(array_to_string(p.proconfig, ','), 'no search_path'),
                        has_function_privilege('authenticated', p.oid, 'EXECUTE'), has_function_privilege('anon', p.oid, 'EXECUTE')) END,
       p.oid IS NOT NULL AND COALESCE(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
         AND (NOT f.definer OR p.prosecdef)
         AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
FROM (VALUES
  ('public.ensure_city_chat_room_for_sit()', true),
  ('public.guard_city_chat_room_location()', true),
  ('public.clear_room_locations_near_home()', true),
  ('public.nn_distance_m(numeric,numeric,numeric,numeric)', false)
) AS f(sig, definer)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT format('trigger %s on %s', t.name, t.tbl), 'enabled',
       COALESCE((SELECT tg.tgenabled::text FROM pg_trigger tg WHERE tg.tgrelid = to_regclass('public.' || t.tbl) AND tg.tgname = t.name), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = to_regclass('public.' || t.tbl) AND tg.tgname = t.name AND tg.tgenabled = 'O')
FROM (VALUES ('guard_city_chat_room_location', 'city_chat_rooms'), ('clear_room_locations_near_home', 'listings'),
             ('ensure_city_chat_room_for_sit', 'sits')) AS t(name, tbl)

UNION ALL
-- The sweep: no other function copies a home's exact location or address.
SELECT 'only the known readers use a home''s exact location or address', 'get_listing_exact_location, get_listing_private_address, get_sitter_guide, set_listing_approx_location, request_listing_timezone, clear_room_locations_near_home, guard_city_chat_room_location, export_account_data',
       COALESCE(string_agg(p.proname, ', ' ORDER BY p.proname), 'none'),
       COALESCE(bool_and(p.proname IN ('get_listing_exact_location', 'get_listing_private_address', 'get_sitter_guide',
                                       'set_listing_approx_location', 'request_listing_timezone', 'clear_room_locations_near_home',
                                       'guard_city_chat_room_location', 'export_account_data')), true)
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prosrc ~* '(address_private|\m(l|v_listing|listing|listings|NEW|OLD)\.(latitude|longitude)\M)'
  AND p.proname NOT IN ('round_sitter_location')

ORDER BY ok, item;
