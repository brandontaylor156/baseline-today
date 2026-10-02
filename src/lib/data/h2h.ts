import "server-only";

import { createPublicClient } from "@/lib/supabase/public";
import { roundRank } from "@/lib/wiki/rows";

import { dedupeResults, RESULT_SELECT, titleFromUrl, toResult, type Result, type ResultRow } from "./results";

export interface HeadToHead {
  meetings: (Result & { surface: string | null })[];
  winsA: number;
  winsB: number;
  bySurface: { surface: string; a: number; b: number }[];
  sources: { title: string; url: string }[];
}

/** Which side of a meeting a player was on. */
const sideOf = (r: Result, playerId: number): 1 | 2 => (r.player1?.id === playerId ? 1 : 2);

/** Pure tally of meetings between A and B (walkovers listed but not counted). */
export function tally(meetings: (Result & { surface: string | null })[], a: number) {
  let winsA = 0;
  let winsB = 0;
  const surfaces = new Map<string, { a: number; b: number }>();
  for (const m of meetings) {
    if (m.winner === null || m.resultDetail === "walkover") continue;
    const aWon = m.winner === sideOf(m, a);
    if (aWon) winsA++;
    else winsB++;
    const key = m.surface ?? "Unknown";
    const s = surfaces.get(key) ?? { a: 0, b: 0 };
    if (aWon) s.a++;
    else s.b++;
    surfaces.set(key, s);
  }
  return {
    winsA,
    winsB,
    bySurface: [...surfaces.entries()].map(([surface, s]) => ({ surface, ...s })).sort((x, y) => y.a + y.b - (x.a + x.b)),
  };
}

export async function getHeadToHead(a: number, b: number): Promise<HeadToHead> {
  const db = createPublicClient();
  const { data, error } = await db
    .from("matches")
    .select(`${RESULT_SELECT}, surface:tournaments!inner(surface)`)
    .eq("status", "final")
    .eq("confirmed", true)
    .or(`and(player1_id.eq.${a},player2_id.eq.${b}),and(player1_id.eq.${b},player2_id.eq.${a})`)
    .limit(200);
  if (error) throw new Error(`head-to-head: ${error.message}`);

  const rows = (data ?? []) as unknown as (ResultRow & { surface: { surface: string | null } })[];
  const surfaceById = new Map(rows.map((r) => [r.id, r.surface?.surface ?? null]));
  const meetings = dedupeResults(rows.map(toResult))
    .map((r) => ({ ...r, surface: surfaceById.get(r.id) ?? null }))
    .sort((x, y) => (y.tournamentStart ?? "").localeCompare(x.tournamentStart ?? "") || roundRank(y.round) - roundRank(x.round));

  const sources: { title: string; url: string }[] = [];
  for (const m of meetings) {
    if (m.provider === "wikipedia" && m.sourceUrl && !sources.some((s) => s.url === m.sourceUrl)) {
      sources.push({ title: titleFromUrl(m.sourceUrl), url: m.sourceUrl });
    }
  }
  return { meetings, ...tally(meetings, a), sources };
}
