import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";

import { sendAlert, sendDigest } from "@/lib/digest";
import { JOBS, jobHealth } from "@/lib/ops";
import { provider } from "@/lib/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { TENNIS_TAG } from "@/lib/supabase/public";
import { runDailySync } from "@/lib/sync/daily";

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
  // Serve fresh rankings on the next visit instead of waiting out the hourly revalidation.
  if (result.status === "ok") revalidateTag(TENNIS_TAG, "max");
  // Daily digest to chat webhooks, if any are configured.
  const digest = await sendDigest().catch((err: Error) => `error: ${err.message}`);
  return Response.json({ ...result, digest }, { status: result.status === "error" ? 500 : 200 });
}
