import { revalidateTag } from "next/cache";

import { notifyFavorites } from "@/lib/push/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { TENNIS_TAG } from "@/lib/supabase/public";
import { scoreBrackets } from "@/lib/sync/bracket-scores";
import { snapshotTitleOdds } from "@/lib/sync/title-snapshots";
import { refreshResults } from "@/lib/sync/wiki-results";

export const maxDuration = 120;

// Public on purpose (Supabase cron every 10 min, page visits). A database lock allows one run at
// a time, and unchanged Wikipedia pages are never downloaded again.
export async function GET() {
  const db = createAdminClient();
  const result = await refreshResults(db);
  // New or newly confirmed results: let cached player pages pick them up.
  if (result.status === "ok" && ((result.results ?? 0) > 0 || (result.confirmed ?? 0) > 0)) revalidateTag(TENNIS_TAG, "max");
  // Title chances over time: a snapshot whenever results moved them.
  const snapshots = result.status === "ok" ? await snapshotTitleOdds(db).catch((err: Error) => `error: ${err.message}`) : undefined;
  // Bracket Challenge scores follow the results.
  const brackets = result.status === "ok" ? await scoreBrackets(db).catch((err: Error) => `error: ${err.message}`) : undefined;
  // Fans hear about newly confirmed results (no-op until push keys are set).
  const push = result.status === "skipped" ? undefined : await notifyFavorites(db);
  return Response.json({ ...result, snapshots, brackets, push }, { headers: { "Cache-Control": "no-store" } });
}
