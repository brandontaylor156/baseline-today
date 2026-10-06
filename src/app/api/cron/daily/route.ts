import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";

import { runBluesky } from "@/lib/bluesky";
import { sendAlert, sendDigest } from "@/lib/digest";
import { submitIndexNow } from "@/lib/indexnow";
import { JOBS, jobHealth } from "@/lib/ops";
import { provider } from "@/lib/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { TENNIS_TAG } from "@/lib/supabase/public";
import { runDailySync } from "@/lib/sync/daily";
import { computeFactors } from "@/lib/sync/factors";
import { computeForecast } from "@/lib/sync/forecast";
import { computeFragility } from "@/lib/sync/fragility";
import { freshPages } from "@/lib/sync/fresh-pages";
import { computeLab } from "@/lib/sync/lab";
import { syncPeople } from "@/lib/sync/people";
import { computePace } from "@/lib/sync/pace";
import { computeProjections } from "@/lib/sync/projections";
import { computeRebuiltRankings } from "@/lib/sync/rebuilt-rankings";
import { computeScorelines } from "@/lib/sync/scorelines";
import { computeSeasonOutlook } from "@/lib/sync/season-outlook";
import { syncTraits } from "@/lib/sync/traits";
import { computeTraits } from "@/lib/sync/traits-analysis";
import { computeTurnarounds } from "@/lib/sync/turnarounds";

export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Called by Vercel Cron once a day (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

  const db = createAdminClient();
  const result = await runDailySync(db, provider);
  console.log(`daily sync: ${JSON.stringify(result)}`);
  if (result.status === "error") await sendAlert(`⚠️ Baseline Today: daily sync failed: ${result.error}`);
  if (result.status === "ok" && "error" in result.model) await sendAlert(`⚠️ Baseline Today: rating model failed: ${result.model.error}`);
  // Watchdog for the 10-minute results job, which runs from Supabase cron and could stop silently.
  const now = new Date();
  const { data: results } = await db.from("sync_state").select("key, last_refreshed_at, status").eq("key", "results").maybeSingle();
  const resultsHealth = jobHealth(results ?? undefined, JOBS.find((j) => j.key === "results")!.staleMinutes, now);
  if (resultsHealth === "stale" || resultsHealth === "never") {
    await sendAlert(`⚠️ Baseline Today: results refresh hasn't succeeded since ${results?.last_refreshed_at ?? "ever"}`);
  }
  // Research lab (rebuilds every draw; about a minute): Mondays, after the week's events finish.
  const lab = now.getUTCDay() === 1 ? await computeLab(db).catch((err: Error) => `error: ${err.message}`) : "weekly";
  // What decides matches (about 30 seconds): Wednesdays, a quiet day for the other weekly jobs.
  const factors =
    now.getUTCDay() === 3
      ? await computeFactors(db, now)
          .then(async (f) => ({ ...f, fragility: await computeFragility(db, now), pace: await computePace(db, now) }))
          .catch((err: Error) => `error: ${err.message}`)
      : "weekly";
  // Scoreline checks (a few minutes): Thursdays.
  const scorelineCheck =
    now.getUTCDay() === 4
      ? await computeScorelines(db, now)
          .then(async (s) => ({ ...s, turnarounds: await computeTurnarounds(db, now) }))
          .catch((err: Error) => `error: ${err.message}`)
      : "weekly";
  // Career comparables (about a minute, from the lab's ratings): Tuesdays, after new players' birth dates.
  const projections =
    now.getUTCDay() === 2
      ? await syncPeople(db, 200)
          .then(async (people) => ({ people, traits: await syncTraits(db).then(() => computeTraits(db, now)), ...(await computeProjections(db, now)) }))
          .catch((err: Error) => `error: ${err.message}`)
      : "weekly";
  // The rest of the season simulated (about 20 seconds): daily until the Finals.
  const season = await computeSeasonOutlook(db, now).catch((err: Error) => `error: ${err.message}`);
  // Rankings rebuilt from results (about 40 seconds): Fridays, incrementally.
  const rebuilt = now.getUTCDay() === 5 ? await computeRebuiltRankings(db, now).catch((err: Error) => `error: ${err.message}`) : "weekly";
  // "If a major started today" (a few seconds): daily, from today's ratings.
  const forecast = await computeForecast(db, now).catch((err: Error) => `error: ${err.message}`);
  // All-time records (expensive): recomputed once a day into stat_cache.
  const records = await db.rpc("refresh_stat_cache").then(({ error }) => (error ? `error: ${error.message}` : "ok"));
  // Serve fresh rankings on the next visit instead of waiting out the hourly revalidation.
  if (result.status === "ok") revalidateTag(TENNIS_TAG, "max");
  // Daily digest to chat webhooks, if any are configured.
  const digest = await sendDigest().catch((err: Error) => `error: ${err.message}`);
  // Tell search engines (IndexNow) about the pages that changed today.
  const indexnow = await freshPages(db, now)
    .then(submitIndexNow)
    .catch((err: Error) => `error: ${err.message}`);
  // Bluesky: the upset of the day and, on Mondays, last week's recap (off until the account is set).
  const bluesky = await runBluesky(db, now).catch((err: Error) => `error: ${err.message}`);
  return Response.json({ ...result, records, lab, factors, scorelines: scorelineCheck, projections, season, rebuilt, forecast, digest, indexnow, bluesky }, { status: result.status === "error" ? 500 : 200 });
}
