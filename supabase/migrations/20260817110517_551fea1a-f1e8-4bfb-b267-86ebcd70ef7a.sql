CREATE TABLE public.review_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sit_id uuid NOT NULL REFERENCES public.sits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  stage integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sit_id, user_id, stage)
);

GRANT SELECT ON public.review_reminders TO authenticated;
GRANT ALL ON public.review_reminders TO service_role;
ALTER TABLE public.review_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own review reminders"
  ON public.review_reminders FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.background_job_state (
  job_name text NOT NULL PRIMARY KEY,
  locked_until timestamptz,
  paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  last_run_at timestamptz,
  last_error text
);

GRANT ALL ON public.background_job_state TO service_role;
ALTER TABLE public.background_job_state ENABLE ROW LEVEL SECURITY;

INSERT INTO public.background_job_state (job_name) VALUES ('review-reminders')
  ON CONFLICT (job_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.acquire_job_lease(p_job_name text, p_lease_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ok boolean := false;
BEGIN
  INSERT INTO public.background_job_state (job_name) VALUES (p_job_name)
    ON CONFLICT (job_name) DO NOTHING;

  UPDATE public.background_job_state
  SET locked_until = now() + make_interval(secs => p_lease_seconds),
      last_run_at = now()
  WHERE job_name = p_job_name
    AND paused = false
    AND (locked_until IS NULL OR locked_until < now());

  v_ok := FOUND;
  RETURN v_ok;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_job_lease(p_job_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.background_job_state SET locked_until = NULL WHERE job_name = p_job_name;
$$;

REVOKE ALL ON FUNCTION public.acquire_job_lease(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_job_lease(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_job_lease(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_job_lease(text) TO service_role;