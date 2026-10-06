import { revalidateTag } from "next/cache";

import { sendAlert } from "@/lib/digest";
import { alertFor } from "@/lib/ops";
import { notifyNextMatches } from "@/lib/push/next-match";
import { notifyFavorites } from "@/lib/push/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { TENNIS_TAG } from "@/lib/supabase/public";
import { scoreBrackets } from "@/lib/sync/bracket-scores";
import { generateRecaps } from "@/lib/sync/recaps";
import { snapshotTitleOdds } from "@/lib/sync/title-snapshots";
import { refreshResults } from "@/lib/sync/wiki-results";

export const maxDuration = 120;

// Public on purpose (Supabase cron every 10 min, page visits). A database lock allows one run at
// a time, and unchanged Wikipedia pages are never downloaded again.
export async function GET() {
  const db = createAdminClient();
  const { data: before } = await db.from("sync_state").select("status").eq("key", "results").maybeSingle();
  const result = await refreshResults(db);
  if (result.status !== "skipped") {
    const alert = alertFor("results refresh", before?.status, result.status, result.status === "error" ? result.error : undefined);
    if (alert) await sendAlert(alert);
  }
  // New or newly confirmed results: let cached player pages pick them up.
  if (result.status === "ok" && ((result.results ?? 0) > 0 || (result.confirmed ?? 0) > 0)) revalidateTag(TENNIS_TAG, "max");
  // Title chances over time: a snapshot whenever results moved them.
  const snapshots = result.status === "ok" ? await snapshotTitleOdds(db).catch((err: Error) => `error: ${err.message}`) : undefined;
  // Bracket Challenge scores follow the results.
  const brackets = result.status === "ok" ? await scoreBrackets(db).catch((err: Error) => `error: ${err.message}`) : undefined;
  // AI recaps of finals and semifinals (off unless switched on; capped per day).
  const recaps = result.status === "ok" ? await generateRecaps(db).catch((err: Error) => `error: ${err.message}`) : undefined;
  // Fans hear about newly confirmed results (no-op until push keys are set).
  const push = result.status === "skipped" ? undefined : await notifyFavorites(db);
  // Fans hear when their player's next opponent is set.
  const nextMatches = result.status === "skipped" ? undefined : await notifyNextMatches(db);
  return Response.json({ ...result, snapshots, brackets, recaps, push, nextMatches }, { headers: { "Cache-Control": "no-store" } });
}
