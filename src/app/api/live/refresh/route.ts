import { liveScoresEnabled } from "@/lib/features";
import { provider } from "@/lib/provider";
import { TOURS } from "@/lib/provider/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshTour } from "@/lib/sync/matches";

export const maxDuration = 60;

// Public on purpose: the scores page, its auto-refresh and the trial collector all call this.
// A per-tour database lock makes at most one provider call per LIVE_LOCK_SECONDS however often
// it is hit, so callers cannot spend the provider quota.
export async function GET() {
  if (!liveScoresEnabled()) return new Response("Not found", { status: 404 });
  const db = createAdminClient();
  const results = await Promise.all(TOURS.map((tour) => refreshTour(db, provider, tour)));
  return Response.json(results, { headers: { "Cache-Control": "no-store" } });
}
