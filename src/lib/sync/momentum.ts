import "server-only";

import { playerKey } from "@/lib/model/load";
import { SCORELINE_PARAMS } from "@/lib/scorelines";
import { IN_MATCH_TAU, nextSetChance } from "@/lib/set-path";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const BATCH = 1000;
const FROM = "2016-01-01";

export interface MomentumGroup {
  key: "coin" | "close" | "clear";
  label: string;
  cases: number;
  /** Next set won by the tiebreak winner: actual share, expected share (in-match model), and the gap with its standard error. */
  actual: number;
  expected: number;
  gap: number;
  se: number;
}

export interface ResilienceRow {
  key: string;
  id: number | null;
  name: string;
  country: string | null;
  cases: number;
  /** After losing a tight tiebreak: next sets won minus expected, shrunk toward zero. */
  bounce: number;
}

export interface MomentumCache {
  generated: string;
  tours: Record<string, { groups: MomentumGroup[]; persistence: { r: number; players: number }; bouncers: ResilienceRow[]; sinkers: ResilienceRow[] }>;
}

type R = {
  tour: "atp" | "wta";
  winner_side: number;
  set_scores: unknown;
  pre_match_p1: number;
  player1_id: number | null;
  player2_id: number | null;
  player1_name: string | null;
  player2_name: string | null;
  player1_country: string | null;
  player2_country: string | null;
  tournaments: { start_date: string; category: string | null };
};

const correlation = (xs: number[], ys: number[]) => {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
};

/**
 * Does winning a tiebreak carry into the next set beyond what the in-match model already learns
 * from it? Tiebreaks graded by the loser's points: coin flips (8-6 or later), close (7-4, 7-5) and
 * clear. Plus each player's record after losing a tight one. Stored in stat_cache as lab:momentum.
 */
export async function computeMomentum(db: AdminClient, now = new Date()) {
  type Case = { tb: "coin" | "close" | "clear"; won: boolean; expected: number; loser: string; date: string };
  const cases: Record<string, Case[]> = { atp: [], wta: [] };
  const who = new Map<string, { id: number | null; name: string; country: string | null }>();
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await db
      .from("matches")
      .select("tour, winner_side, set_scores, pre_match_p1, player1_id, player2_id, player1_name, player2_name, player1_country, player2_country, tournaments!inner(start_date, category)")
      .eq("status", "final")
      .eq("confirmed", true)
      .in("winner_side", [1, 2])
      .is("result_detail", null)
      .not("pre_match_p1", "is", null)
      .gte("tournaments.start_date", FROM)
      .order("id")
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`momentum: load: ${error.message}`);
    for (const r of (data ?? []) as unknown as R[]) {
      const sets = ((Array.isArray(r.set_scores) ? r.set_scores : []) as { p1: number | null; p2: number | null; p1Tiebreak?: number | null; p2Tiebreak?: number | null }[]).filter(
        (x) => x.p1 !== null && x.p2 !== null && x.p1 !== x.p2,
      );
      const bestOf = r.tour === "atp" && /grand slam/i.test(r.tournaments.category ?? "") ? 5 : 3;
      const order = sets.map((x) => (x.p1! > x.p2! ? 1 : 2) as 1 | 2);
      const k1 = playerKey(r.player1_id, r.player1_name);
      const k2 = playerKey(r.player2_id, r.player2_name);
      who.set(k1, { id: r.player1_id, name: r.player1_name ?? k1, country: r.player1_country });
      who.set(k2, { id: r.player2_id, name: r.player2_name ?? k2, country: r.player2_country });
      const params = { ...SCORELINE_PARAMS[r.tour], tau: IN_MATCH_TAU[r.tour] };
      for (let i = 0; i < sets.length - 1; i++) {
        const s = sets[i];
        if (s.p1! + s.p2! !== 13) continue;
        const loserPoints = Math.min(s.p1Tiebreak ?? 99, s.p2Tiebreak ?? 99);
        if (loserPoints === 99) continue;
        const tb = loserPoints >= 6 ? "coin" : loserPoints >= 4 ? "close" : "clear";
        const tbWinner = order[i];
        // Chance the tiebreak winner takes the next set, from everything up to and including this set.
        const pA = nextSetChance(r.pre_match_p1, bestOf, params, order.slice(0, i + 1));
        cases[r.tour].push({ tb, won: order[i + 1] === tbWinner, expected: tbWinner === 1 ? pA : 1 - pA, loser: tbWinner === 1 ? k2 : k1, date: r.tournaments.start_date });
      }
    }
    if (!data || data.length < BATCH) break;
  }

  const data: MomentumCache = { generated: now.toISOString(), tours: {} };
  const labels = { coin: "Coin flips (8–6 or later)", close: "Close (7–4, 7–5)", clear: "Clear (7–3 or wider)" } as const;
  for (const tour of ["atp", "wta"] as const) {
    const cs = cases[tour];
    const groups: MomentumGroup[] = (["coin", "close", "clear"] as const).map((key) => {
      const xs = cs.filter((c) => c.tb === key);
      const n = Math.max(1, xs.length);
      const actual = xs.filter((c) => c.won).length / n;
      const expected = xs.reduce((s, c) => s + c.expected, 0) / n;
      const se = Math.sqrt(xs.reduce((s, c) => s + c.expected * (1 - c.expected), 0)) / n;
      return { key, label: labels[key], cases: xs.length, actual, expected, gap: actual - expected, se };
    });
    // Each player after losing a tight tiebreak (coin flip or close): next set won minus expected.
    const tight = cs.filter((c) => c.tb !== "clear");
    const per = (xs: Case[]) => {
      const m = new Map<string, { n: number; d: number }>();
      for (const c of xs) {
        const e = m.get(c.loser) ?? { n: 0, d: 0 };
        e.n++;
        e.d += (c.won ? 0 : 1) - (1 - c.expected);
        m.set(c.loser, e);
      }
      return m;
    };
    const early = per(tight.filter((c) => c.date < "2021-01-01"));
    const late = per(tight.filter((c) => c.date >= "2021-01-01"));
    const both = [...early].filter(([k, e]) => e.n >= 10 && (late.get(k)?.n ?? 0) >= 10);
    const persistence = { r: correlation(both.map(([, e]) => e.d / e.n), both.map(([k]) => late.get(k)!.d / late.get(k)!.n)), players: both.length };
    const all = [...per(tight)].filter(([, e]) => e.n >= 15).map(([key, e]): ResilienceRow => {
      const w = who.get(key);
      return { key, id: w?.id ?? null, name: w?.name ?? key, country: w?.country ?? null, cases: e.n, bounce: e.d / (e.n + 15) };
    });
    data.tours[tour] = {
      groups,
      persistence,
      bouncers: [...all].sort((a, b) => b.bounce - a.bounce).slice(0, 10),
      sinkers: [...all].sort((a, b) => a.bounce - b.bounce).slice(0, 10),
    };
  }
  const { error } = await db.from("stat_cache").upsert({ key: "lab:momentum", data: data as unknown as Json });
  if (error) throw new Error(`momentum: ${error.message}`);
  return Object.fromEntries(
    Object.entries(data.tours).map(([t, v]) => [t, `${v.groups.map((g) => `${g.key} n${g.cases} ${(g.actual * 100).toFixed(1)} vs ${(g.expected * 100).toFixed(1)} (±${(g.se * 196).toFixed(1)})`).join(" | ")}; persistence r=${v.persistence.r.toFixed(2)} (${v.persistence.players})`]),
  );
}
