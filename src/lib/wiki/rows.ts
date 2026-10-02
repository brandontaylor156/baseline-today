// Pure helpers for storing Wikipedia results (unit tested).

import { createHash } from "node:crypto";

import type { Tour } from "@/lib/provider/types";
import type { Json, TablesInsert } from "@/lib/supabase/database.types";

import { matchIdentity, type WikiMatch } from "./draw-parse";
import { nameKeys, normalizeName } from "./names";

export const WIKI_PROVIDER = "wikipedia";

/** Stable bigint id (52 bits, safe in JS) for a match on a tournament's draw page. */
export function wikiProviderId(tournamentId: number, identity: string): number {
  const hex = createHash("sha1").update(`${tournamentId}|${identity}`).digest("hex").slice(0, 13);
  return parseInt(hex, 16);
}

/** Lookup from normalized name (both word orders) to our player id, for one tour. */
export function playerIndex(players: { id: number; full_name: string }[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const p of players) for (const key of nameKeys(p.full_name)) if (!index.has(key)) index.set(key, p.id);
  return index;
}

export function findPlayer(index: Map<string, number>, name: string): number | null {
  for (const key of nameKeys(name)) {
    const id = index.get(key);
    if (id !== undefined) return id;
  }
  return null;
}

/** How many players on a draw page we know for this tour (discovery check). */
export function knownPlayers(matches: WikiMatch[], index: Map<string, number>): number {
  const names = new Set(matches.flatMap((m) => [m.p1.name, m.p2.name]));
  return [...names].filter((n) => findPlayer(index, n) !== null).length;
}

export function scoreText(m: WikiMatch): string | null {
  if (m.detail === "walkover") return "w/o";
  const sets = m.sets
    .filter((s) => s.p1 !== null && s.p2 !== null)
    .map((s) => {
      // Convention: show the set loser's tiebreak points, e.g. 7-6(4).
      const tb =
        s.p1Tiebreak !== null && s.p2Tiebreak !== null ? Math.min(s.p1Tiebreak, s.p2Tiebreak) : (s.p1Tiebreak ?? s.p2Tiebreak);
      return `${s.p1}-${s.p2}${tb !== null ? `(${tb})` : ""}`;
    })
    .join(" ");
  return sets ? `${sets}${m.detail === "retired" ? " ret." : ""}` : null;
}

export function wikiMatchRow(
  m: WikiMatch,
  ctx: { tour: Tour; tournamentId: number; season: number | null; sourceUrl: string; index: Map<string, number> },
  confirmed: boolean,
  now: Date,
): TablesInsert<"matches"> {
  const identity = matchIdentity(m, normalizeName);
  const p1 = findPlayer(ctx.index, m.p1.name);
  const p2 = findPlayer(ctx.index, m.p2.name);
  return {
    tour: ctx.tour,
    provider: WIKI_PROVIDER,
    provider_id: wikiProviderId(ctx.tournamentId, identity),
    tournament_id: ctx.tournamentId,
    season: ctx.season,
    round: m.round,
    player1_id: p1,
    player2_id: p2,
    player1_name: m.p1.name,
    player2_name: m.p2.name,
    player1_country: m.p1.country,
    player2_country: m.p2.country,
    winner_side: m.winner,
    winner_id: m.winner === 1 ? p1 : m.winner === 2 ? p2 : null,
    status: "final",
    result_detail: m.detail,
    is_live: false,
    score: scoreText(m),
    set_scores: m.sets.map((s, i) => ({ set: i + 1, ...s })) as unknown as Json,
    source_url: ctx.sourceUrl,
    source_key: identity,
    confirmed,
    updated_at: now.toISOString(),
  };
}

/** Signature of what a visitor would see; a change resets confirmation. */
export function resultSignature(r: { winner_side: number | null; score: string | null; result_detail: string | null }): string {
  return `${r.winner_side}|${r.score}|${r.result_detail}`;
}

/** Excludes pages for the other tour's draw at combined events. */
export function titleFitsTour(title: string, tour: Tour): boolean {
  const t = title.toLowerCase();
  // English "Men's/Women's singles"; Italian "Singolare maschile/femminile".
  if (tour === "atp") return !t.includes("women's singles") && !t.includes("singolare femminile");
  return !/(^|[^o])men's singles/.test(t) && !t.includes("singolare maschile");
}

const ROUND_RANK: [RegExp, number][] = [
  [/^final(s)?$/i, 9],
  [/semi/i, 8],
  [/quarter/i, 7],
  [/fourth|round of 16/i, 6],
  [/third|round of 32/i, 5],
  [/second|round of 64/i, 4],
  [/first|round of 128/i, 3],
];

/** Larger = later round. Unknown labels sort first. */
export function roundRank(round: string | null): number {
  if (!round) return 0;
  for (const [re, rank] of ROUND_RANK) if (re.test(round.trim())) return rank;
  return 1;
}
