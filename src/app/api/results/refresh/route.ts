import { revalidateTag } from "next/cache";

import { notifyFavorites } from "@/lib/push/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { TENNIS_TAG } from "@/lib/supabase/public";
import { refreshResults } from "@/lib/sync/wiki-results";

export const maxDuration = 120;

// Public on purpose (Supabase cron every 10 min, page visits). A database lock allows one run at
// a time, and unchanged Wikipedia pages are never downloaded again.
export async function GET() {
  const db = createAdminClient();
  const result = await refreshResults(db);
  // New or newly confirmed results: let cached player pages pick them up.
  if (result.status === "ok" && ((result.results ?? 0) > 0 || (result.confirmed ?? 0) > 0)) revalidateTag(TENNIS_TAG, "max");
  // Fans hear about newly confirmed results (no-op until push keys are set).
  const push = result.status === "skipped" ? undefined : await notifyFavorites(db);
  return Response.json({ ...result, push }, { headers: { "Cache-Control": "no-store" } });
}
