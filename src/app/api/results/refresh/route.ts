import { revalidateTag } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { TENNIS_TAG } from "@/lib/supabase/public";
import { refreshResults } from "@/lib/sync/wiki-results";

export const maxDuration = 120;

// Public on purpose (Supabase cron every 10 min, page visits). A database lock allows one run at
// a time, and unchanged Wikipedia pages are never downloaded again.
export async function GET() {
  const result = await refreshResults(createAdminClient());
  // New or newly confirmed results: let cached player pages pick them up.
  if (result.status === "ok" && ((result.results ?? 0) > 0 || (result.confirmed ?? 0) > 0)) revalidateTag(TENNIS_TAG, "max");
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
