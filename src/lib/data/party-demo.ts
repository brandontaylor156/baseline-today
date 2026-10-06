import "server-only";

import type { MatchInfo } from "@/components/party/party-room";
import { getMatchPreview } from "@/lib/data/match-preview";
import { displayName } from "@/lib/data/tournaments";
import { pointsForSets, type Side } from "@/lib/party-demo";
import type { SetScore } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";

export interface DemoMatch {
  match: MatchInfo;
  points: Side[];
  seed: number;
}

const ROUND_SCORE: Record<string, number> = { Final: 4, Semifinals: 3, Semifinal: 3, Quarterfinals: 2, Quarterfinal: 2 };

type Candidate = { id: number; round: string | null; set_scores: unknown; pre_match_p1: number | null; winner_side: number | null };

/** Higher is a better demo: deep rounds, deciding sets, tiebreaks and upsets. */
function interest(c: Candidate): number {
  const sets = (c.set_scores as SetScore[]) ?? [];
  const p1 = c.pre_match_p1 ?? 0.5;
  const upset = (c.winner_side === 1 && p1 < 0.4) || (c.winner_side === 2 && p1 > 0.6);
  return (ROUND_SCORE[c.round ?? ""] ?? 0) + (sets.length >= 3 ? 3 : 0) + (sets.some((s) => s.p1 === 7 || s.p2 === 7) ? 1 : 0) + (upset ? 1 : 0);
}

async function demoFor(id: number): Promise<DemoMatch | null> {
  const db = createPublicClient();
  const [m, { data: row }] = await Promise.all([
    getMatchPreview(id),
    db.from("matches").select("status, confirmed, set_scores, result_detail").eq("id", id).maybeSingle(),
  ]);
  if (!m || !row || row.status !== "final" || !row.confirmed || row.result_detail) return null;
  const sets = ((row.set_scores as unknown as SetScore[]) ?? []).filter((s) => s.p1 !== null && s.p2 !== null).map((s) => ({ a: s.p1!, b: s.p2! }));
  const bestOf: 3 | 5 = m.tour === "atp" && /grand slam/i.test(m.category ?? "") ? 5 : 3;
  const seed = id;
  const points = pointsForSets(sets, bestOf, seed);
  if (!points) return null;
  const winner = sets.filter((s) => s.a > s.b).length > sets.length / 2 ? 1 : 2;
  return {
    seed,
    points,
    match: {
      id,
      tour: m.tour,
      tournament: displayName(m.match.tournament.name),
      tournamentId: m.match.tournament.id,
      round: m.match.round,
      bestOf,
      a: { id: m.a.id, name: m.a.name, countryCode: m.a.countryCode, rank: m.a.rank },
      b: { id: m.b.id, name: m.b.name, countryCode: m.b.countryCode, rank: m.b.rank },
      chanceA: m.chanceA,
      status: "final",
      winner,
      live: null,
    },
  };
}

/**
 * The match a demo watch party replays: the one asked for, or the most interesting finished match
 * of the last two weeks (only finished, untroubled results replay: no walkovers or retirements).
 */
export async function getDemoMatch(requested: number | null, now = new Date()): Promise<DemoMatch | null> {
  if (requested !== null) return demoFor(requested);
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const { data } = await createPublicClient()
    .from("matches")
    .select("id, round, set_scores, pre_match_p1, winner_side")
    .eq("status", "final")
    .eq("confirmed", true)
    .is("result_detail", null)
    .not("pre_match_p1", "is", null)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(300);
  const ranked = [...(data ?? [])].sort((x, y) => interest(y) - interest(x));
  for (const c of ranked.slice(0, 5)) {
    const demo = await demoFor(c.id);
    if (demo) return demo;
  }
  return null;
}
