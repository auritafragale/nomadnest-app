SELECT cron.unschedule(jobid) FROM cron.job WHERE command LIKE '%trust-strike-emails%';

SELECT cron.schedule(
  'trust-strike-emails-daily',
  '30 9 * * *',
  $$
  select net.http_post(
    url := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/trust-strike-emails',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb,
    timeout_milliseconds := 55000
  ) as request_id;
  $$
);