ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS timezone text;

-- Backfill known homes so the two running sits receive reminders immediately.
UPDATE public.listings SET timezone = 'Asia/Dubai' WHERE city ILIKE 'Dubai' AND (timezone IS NULL OR timezone = '');
UPDATE public.listings SET timezone = 'Asia/Kolkata' WHERE city ILIKE 'Delhi' AND (timezone IS NULL OR timezone = '');

-- Hourly reminder job (service role). The function itself guards once-per-day.
SELECT cron.schedule(
  'sit-checkin-reminders',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := ('https://' || current_setting('app.supabase_url', true)) || '/functions/v1/sit-checkin-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);