-- After the report: delete raw trial measurements (including ESPN reference timings).
truncate public.trial_observations, public.trial_polls;
