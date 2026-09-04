-- 1. Cap active applicants per date range at 5
CREATE OR REPLACE FUNCTION public.enforce_application_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active integer;
BEGIN
  IF NEW.status NOT IN ('applied', 'shortlisted') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_active
  FROM public.applications
  WHERE sit_dates_id = NEW.sit_dates_id
    AND status IN ('applied', 'shortlisted')
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF v_active >= 5 THEN
    RAISE EXCEPTION 'This round already has 5 nomads under review';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_application_cap ON public.applications;
CREATE TRIGGER enforce_application_cap
BEFORE INSERT OR UPDATE OF status ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.enforce_application_cap();

-- 2. Automatic sit status progression
CREATE OR REPLACE FUNCTION public.advance_sit_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sits s
  SET status = 'in_progress'
  FROM public.sit_dates sd
  WHERE sd.id = s.sit_dates_id
    AND s.status = 'confirmed'
    AND sd.start_date <= CURRENT_DATE
    AND sd.end_date >= CURRENT_DATE;

  UPDATE public.sits s
  SET status = 'completed',
      completed_at = COALESCE(s.completed_at, now())
  FROM public.sit_dates sd
  WHERE sd.id = s.sit_dates_id
    AND s.status IN ('confirmed', 'in_progress')
    AND sd.end_date < CURRENT_DATE;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_sit_statuses() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_sit_statuses() TO service_role;

SELECT cron.schedule(
  'advance-sit-statuses',
  '0 1 * * *',
  $$SELECT public.advance_sit_statuses();$$
);