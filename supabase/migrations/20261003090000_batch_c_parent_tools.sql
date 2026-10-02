-- Batch C (Pet Parent tools and profile editors).
--
-- 1. Flag ai_writing_helper_enabled (off; admins can use it while off) for
--    the writing-helper edge function.
-- 2. Helpers: scrub_contact_details (same rules as _shared/ai-scrub.ts) and
--    canonical_pet_type (same map as src/lib/petTypes.ts). Internal only.
-- 3. applications.owner_seen_at + mark_applications_seen(ids) for the "New"
--    pill. Direct app writes can't change it (guard trigger updated).
-- 4. get_listing_applicants(listing): one row per application for the
--    listing's owner. First names only; no last names, emails, phones or
--    locations finer than city. Includes the "Why they fit" facts, built
--    from data, not AI.
-- 5. unshortlist_application: shortlisted back to applied, no notification.
-- 6. decline_application gets an optional personal note (trimmed, contact
--    details removed, max 300 characters) added to the Nomad's notification.
--    Calls with one argument keep working. A manual decline now tells the
--    Nomad "{Pet Parent} isn't going ahead with you for these dates this
--    time" instead of "has chosen another Nomad".
-- 7. remove_listing_dates(range): owner only, refuses booked dates, tells
--    each applied or shortlisted Nomad kindly (listing_dates_removed, push
--    and email), then deletes the range (their applications close with it).
-- 8. Listing gate: a listing can only be inserted, or moved to published, by
--    an owner with an active Pet Parent or Combined membership (founding
--    included) and a verified ID. Admins bypass. Existing drafts can still
--    be edited.
--
-- Every new member-facing function is SECURITY DEFINER with
-- SET search_path = public, EXECUTE revoked from PUBLIC and anon, granted to
-- authenticated. Phone numbers are not read anywhere in this migration.


-- ─── 1. Flag ───────────────────────────────────────────────────────────────

INSERT INTO public.app_settings (key, value)
VALUES ('ai_writing_helper_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- ─── 2. Helpers ────────────────────────────────────────────────────────────

-- Removes emails, links, bare domains, social handles and phone numbers.
CREATE OR REPLACE FUNCTION public.scrub_contact_details(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(COALESCE(p_text, ''),
              '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '', 'g'),
            '(https?://|www\.)[^[:space:]<>"'')]+', '', 'gi'),
          '\m[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|uk|app|dev|info|biz|global)(/[^[:space:]<>"'')]*)?\M', '', 'gi'),
        '(^|[[:space:]])@[A-Za-z0-9_.]{2,30}\M', '\1', 'g'),
      -- Phones: + or 00 with 8+ digits, or any run of 9+ digits with the
      -- usual separators.
      '(\+|\m00)[0-9]([[:space:]().-]*[0-9]){7,}|[0-9]([[:space:]().-]*[0-9]){8,}', '', 'g'),
    '[[:space:]]{2,}', ' ', 'g'));
$$;

REVOKE ALL ON FUNCTION public.scrub_contact_details(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.canonical_pet_type(p_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE k
    WHEN 'dog' THEN 'dogs'
    WHEN 'cat' THEN 'cats'
    WHEN 'bird' THEN 'birds'
    WHEN 'rabbit' THEN 'rabbits'
    WHEN 'reptile' THEN 'reptiles'
    WHEN 'exotic' THEN 'exotics'
    WHEN 'farm_animal' THEN 'farm'
    WHEN 'farm_animals' THEN 'farm'
    WHEN 'small_pets' THEN 'rabbits'
    WHEN 'small_mammals' THEN 'rabbits'
    ELSE k
  END
  FROM (SELECT regexp_replace(lower(btrim(COALESCE(p_type, ''))), '[[:space:]]+', '_', 'g') AS k) s;
$$;

REVOKE ALL ON FUNCTION public.canonical_pet_type(text) FROM PUBLIC, anon, authenticated;


-- ─── 3. "New" pill ─────────────────────────────────────────────────────────

ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS owner_seen_at timestamptz;

-- The guard on direct app writes now also protects owner_seen_at; only
-- mark_applications_seen (SECURITY DEFINER) sets it. Otherwise unchanged.
CREATE OR REPLACE FUNCTION public.guard_application_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean;
BEGIN
  -- Only direct app writes are restricted (see header).
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.sit_dates_id IS DISTINCT FROM OLD.sit_dates_id
     OR NEW.sitter_user_id IS DISTINCT FROM OLD.sitter_user_id
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.who_applying IS DISTINCT FROM OLD.who_applying
     OR NEW.highlights IS DISTINCT FROM OLD.highlights
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.owner_seen_at IS DISTINCT FROM OLD.owner_seen_at THEN
    RAISE EXCEPTION 'Applications can''t be edited this way'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = OLD.listing_id AND l.owner_user_id = v_uid
  ) INTO v_is_owner;

  IF v_is_owner THEN
    IF (OLD.status = 'applied' AND NEW.status = 'shortlisted')
       OR (OLD.status IN ('applied', 'shortlisted') AND NEW.status IN ('declined', 'accepted')) THEN
      RETURN NEW;
    END IF;
  ELSIF v_uid IS NOT NULL AND v_uid = OLD.sitter_user_id THEN
    IF OLD.status IN ('applied', 'shortlisted') AND NEW.status = 'withdrawn' THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'This application status change isn''t allowed'
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_applications_seen(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '28000';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(p_ids) > 200 THEN
    RAISE EXCEPTION 'Too many applications at once.';
  END IF;

  UPDATE public.applications a
  SET owner_seen_at = now()
  FROM public.listings l
  WHERE a.id = ANY (p_ids)
    AND l.id = a.listing_id
    AND l.owner_user_id = v_uid
    AND a.owner_seen_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_applications_seen(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_applications_seen(uuid[]) TO authenticated;


-- ─── 4. get_listing_applicants ─────────────────────────────────────────────

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
  fit_same_city boolean
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
    COALESCE(sp.id_verified, false),
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
    (v_city IS NOT NULL AND lower(btrim(COALESCE(p.city, ''))) = v_city)
  FROM apps
  LEFT JOIN public.profiles p ON p.id = apps.sitter_user_id
  LEFT JOIN public.sitter_profiles sp ON sp.user_id = apps.sitter_user_id
  LEFT JOIN revs ON revs.uid = apps.sitter_user_id
  LEFT JOIN rates ON rates.user_id = apps.sitter_user_id
  LEFT JOIN fit ON fit.app_id = apps.id
  ORDER BY apps.sd_start, apps.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_listing_applicants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_listing_applicants(uuid) TO authenticated;


-- ─── 5. unshortlist_application ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.unshortlist_application(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '28000';
  END IF;

  SELECT a.status, l.owner_user_id INTO v_status, v_owner
  FROM public.applications a
  JOIN public.listings l ON l.id = a.listing_id
  WHERE a.id = p_application_id
  FOR UPDATE OF a;

  IF NOT FOUND OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'Application not found.' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'shortlisted' THEN
    RAISE EXCEPTION 'Only shortlisted applications can be moved back (this one is %).', v_status;
  END IF;

  -- No notification: the Nomad simply stays in the running.
  UPDATE public.applications SET status = 'applied' WHERE id = p_application_id;
  RETURN jsonb_build_object('status', 'applied');
END;
$$;

REVOKE ALL ON FUNCTION public.unshortlist_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unshortlist_application(uuid) TO authenticated;


-- ─── 6. Decline with an optional note ──────────────────────────────────────

-- notify_application_status gains p_note and a manual-decline wording.
-- p_status 'declined_by_owner' = the Pet Parent declined this one; plain
-- 'declined' = closed because someone else was confirmed (unchanged).
DROP FUNCTION IF EXISTS public.notify_application_status(uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.notify_application_status(
  p_application_id uuid,
  p_status text,
  p_sit_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sitter uuid;
  v_listing_id uuid;
  v_listing text;
  v_owner text;
  v_start date;
  v_end date;
  v_dates text;
  v_title text;
  v_message text;
  v_url text;
  v_secret text;
  v_status text := CASE WHEN p_status = 'declined_by_owner' THEN 'declined' ELSE p_status END;
BEGIN
  SELECT a.sitter_user_id, a.listing_id, l.title, NULLIF(TRIM(p.first_name), ''), sd.start_date, sd.end_date
    INTO v_sitter, v_listing_id, v_listing, v_owner, v_start, v_end
  FROM public.applications a
  JOIN public.listings l ON l.id = a.listing_id
  LEFT JOIN public.profiles p ON p.id = l.owner_user_id
  LEFT JOIN public.sit_dates sd ON sd.id = a.sit_dates_id
  WHERE a.id = p_application_id;

  IF v_sitter IS NULL THEN
    RETURN;
  END IF;

  v_owner := COALESCE(v_owner, 'The Pet Parent');
  v_listing := COALESCE(NULLIF(TRIM(v_listing), ''), 'the sit');

  IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
    IF EXTRACT(YEAR FROM v_start) = EXTRACT(YEAR FROM v_end) THEN
      v_dates := to_char(v_start, 'FMDD Mon') || ' to ' || to_char(v_end, 'FMDD Mon YYYY');
    ELSE
      v_dates := to_char(v_start, 'FMDD Mon YYYY') || ' to ' || to_char(v_end, 'FMDD Mon YYYY');
    END IF;
  END IF;

  IF p_status = 'accepted' THEN
    v_title := 'You''ve been accepted';
    v_message := v_owner || ' has confirmed you for ' || v_listing
      || COALESCE(', ' || v_dates, '') || '. Say hello and start planning your stay.';
    v_url := '/dashboard?mode=sitter&appTab=accepted#my-applications';
  ELSIF p_status = 'shortlisted' THEN
    v_title := 'You''ve been shortlisted';
    v_message := v_owner || ' shortlisted you for ' || v_listing
      || '. They may reach out soon to get to know you.';
    v_url := '/dashboard?mode=sitter&appTab=pending#my-applications';
  ELSIF p_status = 'declined_by_owner' THEN
    v_title := 'Update on your application';
    v_message := 'Thank you for applying. ' || v_owner || ' isn''t going ahead with you for '
      || COALESCE(v_dates, 'these dates') || ' this time.'
      || CASE WHEN NULLIF(p_note, '') IS NOT NULL
              THEN ' ' || v_owner || ' says: "' || p_note || '"' ELSE '' END;
    v_url := '/dashboard?mode=sitter&appTab=all#my-applications';
  ELSE
    v_title := 'Update on your application';
    v_message := v_owner || ' has chosen another Nomad for ' || v_listing
      || ' this time. There are plenty more sits waiting for you.';
    v_url := '/dashboard?mode=sitter&appTab=all#my-applications';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    v_sitter,
    'application_status',
    v_title,
    v_message,
    jsonb_build_object(
      'url', v_url,
      'status', v_status,
      'application_id', p_application_id::text,
      'listing_id', v_listing_id::text,
      'sit_id', p_sit_id::text
    )
  );

  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'internal_trigger_secret';

    IF v_secret IS NULL THEN
      RAISE WARNING 'internal_trigger_secret missing from vault; application status email skipped';
    ELSE
      PERFORM net.http_post(
        url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/send-notification-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', v_secret
        ),
        body    := jsonb_build_object(
          'type', 'application_status',
          'recipientUserId', v_sitter::text,
          'skipInAppNotification', true,
          'data', jsonb_build_object(
            'status', v_status,
            'manual', (p_status = 'declined_by_owner'),
            'note', COALESCE(p_note, ''),
            'listingTitle', v_listing,
            'ownerFirstName', v_owner,
            'dateRange', COALESCE(v_dates, ''),
            'url', v_url
          )
        )
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to queue application status email for %: %', p_application_id, SQLERRM;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_application_status(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.decline_application(uuid);

CREATE OR REPLACE FUNCTION public.decline_application(p_application_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_owner uuid;
  v_note text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again to decline this application.' USING ERRCODE = '28000';
  END IF;

  SELECT a.status, l.owner_user_id INTO v_status, v_owner
  FROM public.applications a
  JOIN public.listings l ON l.id = a.listing_id
  WHERE a.id = p_application_id
  FOR UPDATE OF a;

  IF NOT FOUND OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'Application not found.' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('applied', 'shortlisted') THEN
    RAISE EXCEPTION 'This application can''t be declined because it is already %.', v_status;
  END IF;

  -- The personal note: no contact details, at most 300 characters.
  v_note := NULLIF(left(btrim(public.scrub_contact_details(p_note)), 300), '');

  UPDATE public.applications SET status = 'declined' WHERE id = p_application_id;
  PERFORM public.notify_application_status(p_application_id, 'declined_by_owner', NULL, v_note);

  RETURN jsonb_build_object('status', 'declined', 'note', v_note);
END;
$$;

REVOKE ALL ON FUNCTION public.decline_application(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_application(uuid, text) TO authenticated;


-- ─── 7. remove_listing_dates ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.remove_listing_dates(p_sit_dates_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_listing uuid;
  v_owner uuid;
  v_status text;
  v_title text;
  v_owner_name text;
  v_start date;
  v_end date;
  v_dates text;
  v_secret text;
  v_count integer := 0;
  v_app record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '28000';
  END IF;

  SELECT sd.listing_id, l.owner_user_id, sd.status, l.title, sd.start_date, sd.end_date,
         COALESCE(NULLIF(btrim(p.first_name), ''), 'The Pet Parent')
    INTO v_listing, v_owner, v_status, v_title, v_start, v_end, v_owner_name
  FROM public.sit_dates sd
  JOIN public.listings l ON l.id = sd.listing_id
  LEFT JOIN public.profiles p ON p.id = l.owner_user_id
  WHERE sd.id = p_sit_dates_id
  FOR UPDATE OF sd;

  IF NOT FOUND OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'These dates were not found.' USING ERRCODE = '42501';
  END IF;

  IF v_status = 'booked' OR EXISTS (
    SELECT 1 FROM public.sits s
    WHERE s.sit_dates_id = p_sit_dates_id
      AND s.status IN ('confirmed', 'in_progress', 'completed')
  ) THEN
    RAISE EXCEPTION 'These dates are booked. To change them, use Propose new dates on the sit.'
      USING ERRCODE = 'P0001';
  END IF;

  v_title := COALESCE(NULLIF(btrim(v_title), ''), 'a listing');
  IF EXTRACT(YEAR FROM v_start) = EXTRACT(YEAR FROM v_end) THEN
    v_dates := to_char(v_start, 'FMDD Mon') || ' to ' || to_char(v_end, 'FMDD Mon YYYY');
  ELSE
    v_dates := to_char(v_start, 'FMDD Mon YYYY') || ' to ' || to_char(v_end, 'FMDD Mon YYYY');
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_trigger_secret';

  FOR v_app IN
    SELECT a.id, a.sitter_user_id
    FROM public.applications a
    WHERE a.sit_dates_id = p_sit_dates_id
      AND a.status IN ('applied', 'shortlisted')
  LOOP
    v_count := v_count + 1;
    -- In-app row (the push trigger sends the push from it).
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      v_app.sitter_user_id,
      'listing_dates_removed',
      'Those dates are no longer available',
      v_owner_name || ' has removed ' || v_dates || ' from ' || v_title
        || ', so your application for those dates has closed. Thank you for applying, and there are plenty more sits waiting for you.',
      jsonb_build_object('url', '/browse-sits', 'listing_id', v_listing::text)
    );

    BEGIN
      IF v_secret IS NOT NULL THEN
        PERFORM net.http_post(
          url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/send-notification-email',
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
          body    := jsonb_build_object(
            'type', 'listing_dates_removed',
            'recipientUserId', v_app.sitter_user_id::text,
            'skipInAppNotification', true,
            'data', jsonb_build_object(
              'listingTitle', v_title,
              'ownerFirstName', v_owner_name,
              'dates', v_dates,
              'url', '/browse-sits'
            )
          )
        );
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to queue dates-removed email for application %: %', v_app.id, SQLERRM;
    END;
  END LOOP;

  -- Their applications close with the range (they cascade with it).
  DELETE FROM public.sit_dates WHERE id = p_sit_dates_id;

  RETURN jsonb_build_object('removed', true, 'notified', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.remove_listing_dates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_listing_dates(uuid) TO authenticated;


-- ─── 8. Listing gate ───────────────────────────────────────────────────────

-- True when the signed-in member may create or publish a listing: an admin,
-- or a verified ID plus an active Pet Parent or Combined membership (founding
-- included). Same sources as get_my_membership and get_my_verification.
-- Only ever answers for the caller.
CREATE OR REPLACE FUNCTION public.can_publish_listing()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    COALESCE(public.is_admin_user(auth.uid()), false)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.id_verified IS TRUE
        AND (
          p.founding_member IS TRUE
          OR (
            p.membership_status = 'active'
            AND (p.membership_expiry IS NULL OR p.membership_expiry > now())
            AND p.membership_type IN ('owner', 'combined')
          )
        )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_publish_listing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_publish_listing() TO authenticated;

-- Runs as the caller so it can tell app writes (authenticated) from server
-- jobs and SECURITY DEFINER functions, which are never blocked.
CREATE OR REPLACE FUNCTION public.enforce_listing_publish_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     OR (NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published') THEN
    IF NOT public.can_publish_listing() THEN
      RAISE EXCEPTION 'To publish a listing you need an active Pet Parent or Combined membership and a verified ID.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_listing_publish_gate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_listing_publish_gate ON public.listings;
CREATE TRIGGER enforce_listing_publish_gate
BEFORE INSERT OR UPDATE OF status ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.enforce_listing_publish_gate();
