import "server-only";

import { expectedWins, fitExponent, nextSeasonTest, type SeasonLine } from "@/lib/lab/pythagorean";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import { loadMatches } from "./factors";

const MIN = 20;

export interface DeservedRow {
  key: string;
  id: number | null;
  name: string;
  country: string | null;
  wins: number;
  matches: number;
  gameShare: number;
  /** Wins the games deserved, and the gap (real minus deserved). */
  deserved: number;
  gap: number;
}

export interface PythagoreanCache {
  generated: string;
  season: number;
  tours: Record<
    string,
    {
      k: number;
      test: { pairs: number; fromRecord: number; fromGames: number; luckCarries: number };
      lucky: DeservedRow[];
      unlucky: DeservedRow[];
    }
  >;
}

/**
 * The deserved record from games won, for every player-season since 2016; the next-season test;
 * this season's luckiest and unluckiest records. Stored in stat_cache as lab:pythagorean. Weekly.
 */
export async function computePythagorean(db: AdminClient, now = new Date()) {
  const { matches, who } = await loadMatches(db);
  const season = now.getUTCFullYear();
  const data: PythagoreanCache = { generated: now.toISOString(), season, tours: {} };
  for (const tour of ["atp", "wta"] as const) {
    const acc = new Map<string, SeasonLine>();
    for (const m of matches[tour]) {
      if (m.walkover || m.startDate < "2016-01-01" || m.sets.length === 0) continue;
      const y = Number(m.startDate.slice(0, 4));
      for (const side of [1, 2] as const) {
        const key = side === 1 ? m.key1 : m.key2;
        const k = `${key}|${y}`;
        const l = acc.get(k) ?? { key, season: y, wins: 0, matches: 0, gamesWon: 0, gamesPlayed: 0 };
        l.matches++;
        if (m.winner === side) l.wins++;
        for (const [a, b] of m.sets) {
          l.gamesWon += side === 1 ? a : b;
          l.gamesPlayed += a + b;
        }
        acc.set(k, l);
      }
    }
    const lines = [...acc.values()];
    const k = fitExponent(lines.filter((l) => l.season < season), MIN);
    const test = nextSeasonTest(lines, k, MIN);
    const current = lines
      .filter((l) => l.season === season && l.matches >= MIN)
      .map((l): DeservedRow => {
        const w = who.get(l.key);
        const deserved = expectedWins(l.gamesWon / l.gamesPlayed, k) * l.matches;
        return { key: l.key, id: w?.id ?? null, name: w?.name ?? l.key, country: w?.country ?? null, wins: l.wins, matches: l.matches, gameShare: l.gamesWon / l.gamesPlayed, deserved, gap: l.wins - deserved };
      });
    data.tours[tour] = {
      k,
      test,
      lucky: [...current].sort((a, b) => b.gap - a.gap).slice(0, 12),
      unlucky: [...current].sort((a, b) => a.gap - b.gap).slice(0, 12),
    };
  }
  const { error } = await db.from("stat_cache").upsert({ key: "lab:pythagorean", data: data as unknown as Json });
  if (error) throw new Error(`pythagorean: ${error.message}`);
  return Object.fromEntries(Object.entries(data.tours).map(([t, v]) => [t, `k ${v.k.toFixed(2)}, record r ${v.test.fromRecord.toFixed(3)} vs games r ${v.test.fromGames.toFixed(3)}, luck carries ${v.test.luckCarries.toFixed(3)} (${v.test.pairs} pairs)`]));
}
