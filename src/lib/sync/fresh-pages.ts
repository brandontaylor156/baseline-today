import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { mondayOf, shiftWeek } from "@/lib/weeks";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Pages that changed in the last day, for search engine pings: section pages, tournaments in play,
 * new draw analyses, matches finished or scheduled, and last week's recap.
 */
export async function freshPages(db: AdminClient, now = new Date()): Promise<string[]> {
  const today = now.toISOString().slice(0, 10);
  const dayAgo = new Date(now.getTime() - 26 * 3_600_000).toISOString();
  const [tournaments, finished, scheduled, draws] = await Promise.all([
    db.from("tournaments").select("id").not("category", "is", null).lte("start_date", today).gte("end_date", today).limit(200),
    db.from("matches").select("id").eq("status", "final").eq("confirmed", true).gte("updated_at", dayAgo).limit(3000),
    db.from("matches").select("id").eq("status", "scheduled").limit(1000),
    // Draws published or updated in the last day: their draw-day analysis.
    db.from("wiki_draws").select("tournament_id").gte("last_rev_at", dayAgo).not("bracket->lines", "is", null).limit(200),
  ]);
  return [
    "/",
    "/results",
    "/tournaments",
    "/rankings/atp",
    "/rankings/wta",
    "/odds",
    "/week",
    `/week/${shiftWeek(mondayOf(today), -1)}`,
    ...(tournaments.data ?? []).map((t) => `/tournaments/${t.id}`),
    ...(draws.data ?? []).map((d) => `/tournaments/${d.tournament_id}/draw-report`),
    ...(finished.data ?? []).map((m) => `/matches/${m.id}`),
    ...(scheduled.data ?? []).map((m) => `/matches/${m.id}`),
  ];
}
