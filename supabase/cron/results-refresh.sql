-- Refreshes Wikipedia results every 10 minutes (Vercel Hobby cron can only run daily).
-- The endpoint is lock-bounded and skips unchanged pages, so this costs a few cheap API calls.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobname) from cron.job where jobname = 'results-refresh';
select cron.schedule(
  'results-refresh', '*/10 * * * *',
  $$select net.http_get(url := 'https://baseline-today.vercel.app/api/results/refresh', timeout_milliseconds := 60000)$$
);
select jobname, schedule, active from cron.job where jobname = 'results-refresh';
