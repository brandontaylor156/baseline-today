# BALLDONTLIE 48-hour trial runbook

Goal: measure live-score lag, update cadence and coverage, then decide whether to pay
($9.99/month per tour). Collection runs in Supabase (pg_cron), so no computer needs to stay on.

## Before (no clock running)

- [ ] CI green on `main`; `npm run trial:report` runs (empty).
- [ ] Daily job has stored this season's tournaments (`select count(*) from tournaments` > 0).

## Start (Brandon clicks, Claude runs the rest, about 3 minutes)

1. **Brandon:** start the 48-hour trial at app.balldontlie.io for **ATP and WTA**, on the same account
   and key (no key change needed). Tell Claude "started".
2. **Claude:** check that one `matches?is_live=true` call per tour returns 200 instead of 401.
3. **Claude:** turn on `LIVE_SCORES_ENABLED=1` and `TRIAL_SAMPLING=1` in Vercel production (not
   secrets), then redeploy.
4. **Claude:** run `supabase/trial/start-collector.sql` (polls every 20s, stops itself after 48.5h).
5. **Claude:** after 2 minutes, confirm `trial_polls` has 200s for both sources and tours and that
   `/scores` shows real matches.

## During

- `npm run trial:report` at any time. Check after the first night for 429s and coverage gaps.
- Rate budget during the trial: 5 requests/min per tour. Polling uses at most 3/min per tour, plus
  a full schedule refresh every 15 min.

## End

1. Collector stops itself (or run `supabase/trial/stop-collector.sql`).
2. `npm run trial:report` → decision write-up for Brandon.
3. If **not paying**: unset `LIVE_SCORES_ENABLED` and `TRIAL_SAMPLING` and redeploy; the matches
   table keeps the data collected so far.
   If **paying**: unset `TRIAL_SAMPLING` only; raise the polling limits to the paid tier (60/min).
4. Run `supabase/trial/delete-data.sql` (raw measurements, including ESPN reference timings).
