-- The nightly job called the reminder service with pg_net's default 5s timeout,
-- so the request was aborted before the service could finish: sits were never
-- auto-completed and review reminders never went out. Give it room to finish.
SELECT cron.unschedule('review-reminders-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'review-reminders-daily');

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE command LIKE '%review-reminders%';

SELECT cron.schedule(
  'review-reminders-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/review-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb,
    timeout_milliseconds := 55000
  ) as request_id;
  $$
);