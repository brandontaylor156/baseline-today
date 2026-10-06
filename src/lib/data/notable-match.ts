import "server-only";

import type { SetScore } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";

const ROUND_SCORE: Record<string, number> = { Final: 4, Semifinals: 3, Semifinal: 3, Quarterfinals: 2, Quarterfinal: 2 };

type Candidate = { id: number; round: string | null; set_scores: unknown; pre_match_p1: number | null; winner_side: number | null };

/** Higher is more worth showing: deep rounds, deciding sets, tiebreaks and upsets. */
function interest(c: Candidate): number {
  const sets = (c.set_scores as SetScore[]) ?? [];
  const p1 = c.pre_match_p1 ?? 0.5;
  const upset = (c.winner_side === 1 && p1 < 0.4) || (c.winner_side === 2 && p1 > 0.6);
  return (ROUND_SCORE[c.round ?? ""] ?? 0) + (sets.length >= 3 ? 3 : 0) + (sets.some((s) => s.p1 === 7 || s.p2 === 7) ? 1 : 0) + (upset ? 1 : 0);
}

/** The most interesting completed real result of the last two weeks (no walkovers or retirements). */
export async function getNotableMatchId(now = new Date()): Promise<number | null> {
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
  return [...(data ?? [])].sort((x, y) => interest(y) - interest(x))[0]?.id ?? null;
}
