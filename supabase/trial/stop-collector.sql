-- Stops the trial collector immediately (data stays for the report).
select cron.unschedule(jobname) from cron.job where jobname like 'trial-%';
update public.sync_state set status = 'stopped' where key = 'trial';
select count(*) as remaining_trial_jobs from cron.job where jobname like 'trial-%';
