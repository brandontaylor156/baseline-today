import "server-only";

import type { TennisProvider, Tour } from "@/lib/provider/types";
import type { AdminClient } from "@/lib/supabase/admin";

import { playerRow } from "./rows";

/** Mondays from `from` to `to` inclusive (YYYY-MM-DD), the provider's ranking weeks. */
export function mondays(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7)); // first Monday on/after `from`
  for (; d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 7)) out.push(d.toISOString().slice(0, 10));
  return out;
}

/**
 * One-off: stores weekly top-100 snapshots for a date range (free tier, ~1 call per week).
 * Weeks already stored are skipped; players new to us are inserted without overwriting profiles.
 */
export async function backfillRankings(
  db: AdminClient,
  provider: TennisProvider,
  tour: Tour,
  from: string,
  to: string,
  log: (line: string) => void = () => {},
  paceMs = 0,
) {
  const { data: stored } = await db.rpc("ranking_dates", { p_tour: tour });
  const have = new Set(stored ?? []);
  let weeks = 0;
  let rows = 0;

  for (const monday of mondays(from, to)) {
    if (have.has(monday)) continue;
    const rankings = await provider.getRankings(tour, 100, monday);
    if (paceMs) await new Promise((resolve) => setTimeout(resolve, paceMs)); // free tier: 5 requests/min
    const date = rankings[0]?.rankingDate;
    if (!date || have.has(date)) continue; // provider returned an earlier week we already have
    have.add(date);

    const ins = await db
      .from("players")
      .upsert(rankings.map((r) => playerRow(r.player, provider.name)), { onConflict: "provider,tour,provider_id", ignoreDuplicates: true });
    if (ins.error) throw new Error(`insert players: ${ins.error.message}`);
    const { data: ids, error } = await db
      .from("players")
      .select("id, provider_id")
      .eq("provider", provider.name)
      .eq("tour", tour)
      .in("provider_id", rankings.map((r) => r.player.providerId));
    if (error) throw new Error(`player ids: ${error.message}`);
    const idOf = new Map((ids ?? []).map((p) => [p.provider_id, p.id]));

    const snapshot = rankings.flatMap((r) => {
      const playerId = idOf.get(r.player.providerId);
      return playerId === undefined ? [] : [{ tour, ranking_date: date, player_id: playerId, rank: r.rank, points: r.points, movement: r.movement }];
    });
    const saved = await db.from("rankings").upsert(snapshot, { onConflict: "tour,ranking_date,player_id" });
    if (saved.error) throw new Error(`save rankings: ${saved.error.message}`);
    weeks++;
    rows += snapshot.length;
    log(`${tour} ${date}: ${snapshot.length}`);
  }
  return { tour, weeks, rows };
}
