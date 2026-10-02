-- Trial collector: polls the provider (through our own lock-bounded refresh endpoint) and ESPN
-- (timing reference) every 20 seconds, entirely inside Supabase, so no computer has to stay on.
-- Run once at the start of the 48-hour trial. Stops itself after 48.5 hours.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobname) from cron.job where jobname like 'trial-%';

select cron.schedule(
  'trial-provider-poll', '20 seconds',
  $$select net.http_get(url := 'https://baseline-today.vercel.app/api/live/refresh', timeout_milliseconds := 30000)$$
);
select cron.schedule(
  'trial-espn-poll', '20 seconds',
  $$select net.http_get(url := 'https://baseline-today.vercel.app/api/trial/espn', timeout_milliseconds := 15000)$$
);

-- Safety net: unschedule everything once the trial window is over.
insert into public.sync_state (key, status, details)
values ('trial', 'running', jsonb_build_object('started_at', now(), 'stop_at', now() + interval '48 hours 30 minutes'))
on conflict (key) do update set status = excluded.status, details = excluded.details;

select cron.schedule(
  'trial-auto-stop', '*/5 * * * *',
  $$
  select cron.unschedule(jobname) from cron.job
  where jobname like 'trial-%'
    and now() > (select (details->>'stop_at')::timestamptz from public.sync_state where key = 'trial');
  $$
);

select jobname, schedule from cron.job where jobname like 'trial-%' order by 1;
