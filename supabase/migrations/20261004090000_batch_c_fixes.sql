-- Batch C fixes.
--
-- 1. get_listing_applicants also returns the sit an accepted application
--    became (sit_id, sit_status), so finished and cancelled sits move to Past,
--    and reads id_verified from profiles (the real ID check result). Same
--    owner-only rule and first names only.
-- 2. applications.owner_seen_at is for the listing owner only (they get it
--    through get_listing_applicants). Members lose table-wide SELECT on
--    applications and get SELECT on every other column. Every app query
--    already names its columns; no database function reads the column as the
--    caller.
-- 3. One source for "ID verified": profiles.id_verified. The sitter_profiles
--    copy is synced once and kept in step by a trigger until the column is
--    dropped later. New sitter_profiles rows start from profiles too.
--
-- No phone numbers are read anywhere in this migration.


-- ─── 1. get_listing_applicants (new columns, so drop and recreate) ─────────

DROP FUNCTION IF EXISTS public.get_listing_applicants(uuid);

CREATE OR REPLACE FUNCTION public.get_listing_applicants(p_listing_id uuid)
RETURNS TABLE (
  application_id uuid,
  sit_dates_id uuid,
  start_date date,
  end_date date,
  status public.application_status,
  created_at timestamptz,
  owner_seen boolean,
  message text,
  who_applying text,
  highlights text[],
  sitter_user_id uuid,
  first_name text,
  avatar_url text,
  city text,
  country text,
  founding_member boolean,
  id_verified boolean,
  pet_types text[],
  review_count integer,
  avg_rating numeric,
  review_rate integer,
  fit_total_nights integer,
  fit_free_nights integer,
  fit_free_from date,
  fit_free_to date,
  fit_pets_known text[],
  fit_pets_missing text[],
  fit_meds_ok boolean,
  fit_same_city boolean,
  sit_id uuid,
  sit_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_city text;
  v_pet_types text[];
  v_meds boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '28000';
  END IF;

  SELECT l.owner_user_id, NULLIF(lower(btrim(l.city)), '') INTO v_owner, v_city
  FROM public.listings l WHERE l.id = p_listing_id;
  IF NOT FOUND OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'Listing not found.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT public.canonical_pet_type(pt.type)) FILTER (
           WHERE public.canonical_pet_type(pt.type) NOT IN ('', 'other')), ARRAY[]::text[]),
         COALESCE(bool_or(pt.requires_medication IS TRUE OR pt.has_medication IS TRUE), false)
    INTO v_pet_types, v_meds
  FROM public.pets pt WHERE pt.listing_id = p_listing_id;

  RETURN QUERY
  WITH apps AS (
    SELECT a.*, sd.start_date AS sd_start, sd.end_date AS sd_end
    FROM public.applications a
    JOIN public.sit_dates sd ON sd.id = a.sit_dates_id
    WHERE a.listing_id = p_listing_id
  ),
  nomads AS (
    SELECT DISTINCT apps.sitter_user_id AS uid FROM apps
  ),
  rates AS (
    SELECT r.user_id, r.review_rate
    FROM public.member_review_rates(ARRAY(SELECT uid FROM nomads)) r
  ),
  revs AS (
    SELECT rv.reviewee_user_id AS uid, COUNT(*)::integer AS n, ROUND(AVG(rv.rating)::numeric, 2) AS avg
    FROM public.reviews rv
    WHERE rv.reviewee_user_id IN (SELECT uid FROM nomads)
    GROUP BY rv.reviewee_user_id
  ),
  -- Nights of each application's range the Nomad has marked free (and isn't
  -- booked elsewhere), only for Nomads who keep a calendar at all.
  nights AS (
    SELECT apps.id AS app_id, d::date AS night,
           EXISTS (
             SELECT 1 FROM public.sitter_availability av
             WHERE av.sitter_user_id = apps.sitter_user_id
               AND d::date BETWEEN av.start_date AND av.end_date
           )
           AND NOT EXISTS (
             SELECT 1 FROM public.sits s
             LEFT JOIN public.sit_dates bsd ON bsd.id = s.sit_dates_id
             WHERE s.sitter_user_id = apps.sitter_user_id
               AND s.status IN ('confirmed', 'in_progress')
               AND s.listing_id IS DISTINCT FROM p_listing_id
               AND d::date BETWEEN COALESCE(bsd.start_date, s.snapshot_start_date)
                               AND COALESCE(bsd.end_date, s.snapshot_end_date)
           ) AS free
    FROM apps
    CROSS JOIN LATERAL generate_series(apps.sd_start, GREATEST(apps.sd_end - 1, apps.sd_start), interval '1 day') d
    WHERE EXISTS (SELECT 1 FROM public.sitter_availability av2 WHERE av2.sitter_user_id = apps.sitter_user_id)
  ),
  fit AS (
    SELECT app_id,
           COUNT(*)::integer AS total,
           COUNT(*) FILTER (WHERE free)::integer AS free_n,
           MIN(night) FILTER (WHERE free) AS free_from,
           MAX(night) FILTER (WHERE free) AS free_to
    FROM nights GROUP BY app_id
  )
  SELECT
    apps.id,
    apps.sit_dates_id,
    apps.sd_start,
    apps.sd_end,
    apps.status,
    apps.created_at,
    (apps.owner_seen_at IS NOT NULL),
    apps.message,
    apps.who_applying,
    apps.highlights,
    apps.sitter_user_id,
    NULLIF(btrim(p.first_name), ''),
    p.avatar_url,
    p.city,
    p.country,
    COALESCE(p.founding_member, false),
    -- The real result of the ID check, not the sitter_profiles copy.
    COALESCE(p.id_verified, false),
    COALESCE(sp.pet_types, ARRAY[]::text[]),
    COALESCE(revs.n, 0),
    revs.avg,
    rates.review_rate,
    GREATEST(apps.sd_end - apps.sd_start, 1)::integer,
    fit.free_n,
    fit.free_from,
    CASE WHEN fit.free_to IS NULL THEN NULL ELSE fit.free_to + 1 END,
    ARRAY(
      SELECT t FROM unnest(v_pet_types) t
      WHERE t = ANY (ARRAY(SELECT public.canonical_pet_type(x) FROM unnest(COALESCE(sp.pet_types, ARRAY[]::text[])) x))
    ),
    ARRAY(
      SELECT t FROM unnest(v_pet_types) t
      WHERE NOT (t = ANY (ARRAY(SELECT public.canonical_pet_type(x) FROM unnest(COALESCE(sp.pet_types, ARRAY[]::text[])) x)))
    ),
    CASE WHEN v_meds THEN 'Pets with medication' = ANY (COALESCE(sp.comfortable_with, ARRAY[]::text[])) ELSE NULL END,
    (v_city IS NOT NULL AND lower(btrim(COALESCE(p.city, ''))) = v_city),
    st.id,
    st.status::text
  FROM apps
  LEFT JOIN public.profiles p ON p.id = apps.sitter_user_id
  LEFT JOIN public.sitter_profiles sp ON sp.user_id = apps.sitter_user_id
  LEFT JOIN revs ON revs.uid = apps.sitter_user_id
  LEFT JOIN rates ON rates.user_id = apps.sitter_user_id
  LEFT JOIN fit ON fit.app_id = apps.id
  -- The sit this application turned into (only for accepted ones), newest first.
  LEFT JOIN LATERAL (
    SELECT s.id, s.status
    FROM public.sits s
    WHERE apps.status = 'accepted'
      AND s.listing_id = apps.listing_id
      AND s.sitter_user_id = apps.sitter_user_id
      AND (s.sit_dates_id = apps.sit_dates_id
           OR (s.sit_dates_id IS NULL AND s.snapshot_start_date = apps.sd_start AND s.snapshot_end_date = apps.sd_end))
    ORDER BY s.created_at DESC
    LIMIT 1
  ) st ON true
  ORDER BY apps.sd_start, apps.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_listing_applicants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_listing_applicants(uuid) TO authenticated;


-- ─── 2. owner_seen_at: the listing owner only ──────────────────────────────

REVOKE SELECT ON public.applications FROM anon, authenticated;

DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
    INTO v_cols
  FROM pg_attribute a
  WHERE a.attrelid = 'public.applications'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attname <> 'owner_seen_at';
  EXECUTE format('GRANT SELECT (%s) ON public.applications TO authenticated', v_cols);
END;
$$;


-- ─── 3. id_verified: profiles is the source, sitter_profiles follows ───────

-- The sitter_profiles guard blocks members changing the copy. It now also
-- lets the sync below through (a flag set for that one statement only).
CREATE OR REPLACE FUNCTION public.prevent_sitter_verification_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Only end-user (authenticated role) writes are restricted; the backend
  -- (service role, e.g. onfido-webhook) and direct admin tooling may proceed.
  IF coalesce(current_setting('role', true), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- The id_verified sync from profiles (sync_sitter_id_verified).
  IF coalesce(current_setting('app.sync_id_verified', true), '') = 'on'
     AND NEW.background_check IS NOT DISTINCT FROM OLD.background_check THEN
    RETURN NEW;
  END IF;

  -- Admins may adjust verification flags (manual review flow).
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN NEW;
  END IF;

  IF NEW.id_verified IS DISTINCT FROM OLD.id_verified THEN
    RAISE EXCEPTION 'Insufficient privileges to modify ID verification status';
  END IF;

  IF NEW.background_check IS DISTINCT FROM OLD.background_check THEN
    RAISE EXCEPTION 'Insufficient privileges to modify background check status';
  END IF;

  RETURN NEW;
END;
$fn$;

-- profiles.id_verified changed: copy it to the Nomad profile.
CREATE OR REPLACE FUNCTION public.sync_sitter_id_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM set_config('app.sync_id_verified', 'on', true);
  UPDATE public.sitter_profiles
  SET id_verified = COALESCE(NEW.id_verified, false)
  WHERE user_id = NEW.id
    AND id_verified IS DISTINCT FROM COALESCE(NEW.id_verified, false);
  PERFORM set_config('app.sync_id_verified', '', true);
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sync_sitter_id_verified() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_sitter_id_verified ON public.profiles;
CREATE TRIGGER sync_sitter_id_verified
AFTER UPDATE OF id_verified ON public.profiles
FOR EACH ROW
WHEN (OLD.id_verified IS DISTINCT FROM NEW.id_verified)
EXECUTE FUNCTION public.sync_sitter_id_verified();

-- A new Nomad profile starts with the real value.
CREATE OR REPLACE FUNCTION public.set_new_sitter_id_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  NEW.id_verified := COALESCE((SELECT p.id_verified FROM public.profiles p WHERE p.id = NEW.user_id), false);
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_new_sitter_id_verified() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_new_sitter_id_verified ON public.sitter_profiles;
CREATE TRIGGER set_new_sitter_id_verified
BEFORE INSERT ON public.sitter_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_new_sitter_id_verified();

-- Sync once now.
UPDATE public.sitter_profiles sp
SET id_verified = COALESCE(p.id_verified, false)
FROM public.profiles p
WHERE p.id = sp.user_id
  AND sp.id_verified IS DISTINCT FROM COALESCE(p.id_verified, false);
