-- 0. lightweight accent stripper (avoids depending on the unaccent extension)
CREATE OR REPLACE FUNCTION public.unaccent_fallback(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT translate(p_text,
    'àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÑÇ',
    'aaaaaaeeeeiiiiooooouuuuyyncAAAAAAEEEEIIIIOOOOOUUUUYNC');
$$;

-- 1. Normalisation helper
CREATE OR REPLACE FUNCTION public.city_chat_key(p_city text, p_country text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
           regexp_replace(
             lower(unaccent_fallback(btrim(coalesce(p_city, '')))), '[^a-z0-9]+', '-', 'g'),
           '(^-|-$)', '', 'g')
         || '-' ||
         regexp_replace(
           regexp_replace(
             CASE lower(btrim(coalesce(p_country, '')))
               WHEN 'uae' THEN 'united arab emirates'
               WHEN 'ae' THEN 'united arab emirates'
               WHEN 'uk' THEN 'united kingdom'
               WHEN 'gb' THEN 'united kingdom'
               WHEN 'usa' THEN 'united states'
               WHEN 'us' THEN 'united states'
               WHEN 'au' THEN 'australia'
               WHEN 'pt' THEN 'portugal'
               WHEN 'fr' THEN 'france'
               WHEN 'es' THEN 'spain'
               WHEN 'it' THEN 'italy'
               WHEN 'de' THEN 'germany'
               WHEN 'hu' THEN 'hungary'
               WHEN 'ro' THEN 'romania'
               WHEN 'be' THEN 'belgium'
               WHEN 'za' THEN 'south africa'
               WHEN 'ar' THEN 'argentina'
               WHEN 'co' THEN 'colombia'
               WHEN 'nl' THEN 'netherlands'
               WHEN 'ca' THEN 'canada'
               WHEN 'nz' THEN 'new zealand'
               WHEN 'mx' THEN 'mexico'
               WHEN 'br' THEN 'brazil'
               WHEN 'th' THEN 'thailand'
               ELSE lower(btrim(coalesce(p_country, '')))
             END, '[^a-z0-9]+', '-', 'g'),
           '(^-|-$)', '', 'g');
$$;

-- 2. Canonicalise displayed country names on existing rooms
UPDATE public.city_chat_rooms SET country = 'United Arab Emirates' WHERE lower(btrim(country)) IN ('uae','ae');
UPDATE public.city_chat_rooms SET country = 'United Kingdom' WHERE lower(btrim(country)) IN ('uk','gb');
UPDATE public.city_chat_rooms SET country = 'United States' WHERE lower(btrim(country)) IN ('us','usa');

-- 3. Merge duplicates: keep the oldest room per normalised key
WITH ranked AS (
  SELECT id, public.city_chat_key(city, country) AS k,
         ROW_NUMBER() OVER (PARTITION BY public.city_chat_key(city, country) ORDER BY created_at ASC) AS rn,
         FIRST_VALUE(id) OVER (PARTITION BY public.city_chat_key(city, country) ORDER BY created_at ASC) AS keep_id
  FROM public.city_chat_rooms
)
UPDATE public.city_chat_messages m
SET room_id = r.keep_id
FROM ranked r
WHERE m.room_id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY public.city_chat_key(city, country) ORDER BY created_at ASC) AS rn
  FROM public.city_chat_rooms
)
DELETE FROM public.city_chat_rooms c
USING ranked r
WHERE c.id = r.id AND r.rn > 1;

-- 4. Recompute keys
UPDATE public.city_chat_rooms SET city_key = public.city_chat_key(city, country);

-- 5. Enforce via trigger
CREATE OR REPLACE FUNCTION public.set_city_chat_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.city_key := public.city_chat_key(NEW.city, NEW.country);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_city_chat_key ON public.city_chat_rooms;
CREATE TRIGGER set_city_chat_key
BEFORE INSERT OR UPDATE ON public.city_chat_rooms
FOR EACH ROW EXECUTE FUNCTION public.set_city_chat_key();

-- 6. Keep a single unique index
DROP INDEX IF EXISTS public.city_chat_rooms_city_key_unique;
DROP INDEX IF EXISTS public.idx_city_chat_rooms_city_key;