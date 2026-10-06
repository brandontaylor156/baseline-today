import "server-only";

import { playerKey } from "@/lib/model/load";
import { SCORELINE_PARAMS } from "@/lib/scorelines";
import { IN_MATCH_TAU, lowestForWinner, setPath } from "@/lib/set-path";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const BATCH = 1000;
const FROM = "2016-01-01";

export interface Turnaround {
  matchId: number;
  season: number;
  tournament: string;
  tournamentId: number;
  round: string | null;
  winner: { id: number | null; name: string; country: string | null };
  loser: { id: number | null; name: string; country: string | null };
  /** The winner's pre-match chance and lowest chance after any set; the score from the winner's side. */
  pre: number;
  low: number;
  score: string;
}

export interface AfterFirstSet {
  /** The favourite's pre-match chance bin, matches where they lost the first set, and how many they still won. */
  bin: string;
  matches: number;
  predicted: number;
  scoreOnly: number;
  actual: number;
}

export interface TurnaroundsCache {
  generated: string;
  tours: Record<
    string,
    {
      matches: number;
      /** Log loss of the chance after the first set: learning from the sets vs the score alone. */
      logLoss: number;
      scoreOnlyLogLoss: number;
      afterFirstSet: AfterFirstSet[];
      greatest: Turnaround[];
    }
  >;
}

type R = {
  id: number;
  tour: "atp" | "wta";
  season: number;
  round: string | null;
  winner_side: number;
  set_scores: unknown;
  pre_match_p1: number;
  player1_id: number | null;
  player2_id: number | null;
  player1_name: string | null;
  player2_name: string | null;
  player1_country: string | null;
  player2_country: string | null;
  tournament_id: number;
  tournaments: { name: string; start_date: string; category: string | null };
};

/**
 * Win chances after each set for every completed match since 2016: how well they hold up, what
 * losing the first set does to a favourite, and the greatest turnarounds. Stored in stat_cache as
 * lab:turnarounds. Weekly, with the scoreline check.
 */
export async function computeTurnarounds(db: AdminClient, now = new Date(), tauOverride?: number) {
  const data: TurnaroundsCache = { generated: now.toISOString(), tours: {} };
  const acc: Record<string, { n: number; ll: number; ll0: number; bins: Map<string, { n: number; p: number; p0: number; won: number }>; all: Turnaround[] }> = {};
  for (const t of ["atp", "wta"]) acc[t] = { n: 0, ll: 0, ll0: 0, bins: new Map(), all: [] };

  for (let from = 0; ; from += BATCH) {
    const { data: rows, error } = await db
      .from("matches")
      .select(
        "id, tour, season, round, winner_side, set_scores, pre_match_p1, player1_id, player2_id, player1_name, player2_name, player1_country, player2_country, tournament_id, tournaments!inner(name, start_date, category)",
      )
      .eq("status", "final")
      .eq("confirmed", true)
      .in("winner_side", [1, 2])
      .is("result_detail", null)
      .not("pre_match_p1", "is", null)
      .gte("tournaments.start_date", FROM)
      .order("id")
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`turnarounds: load: ${error.message}`);
    for (const r of (rows ?? []) as unknown as R[]) {
      const sets = ((Array.isArray(r.set_scores) ? r.set_scores : []) as { p1: number | null; p2: number | null }[]).filter((x) => x.p1 !== null && x.p2 !== null && x.p1 !== x.p2);
      const bestOf = r.tour === "atp" && /grand slam/i.test(r.tournaments.category ?? "") ? 5 : 3;
      const order = sets.map((x) => (x.p1! > x.p2! ? 1 : 2) as 1 | 2);
      const need = Math.ceil(bestOf / 2);
      const w1 = order.filter((s) => s === 1).length;
      if (Math.max(w1, order.length - w1) !== need || (w1 === need) !== (r.winner_side === 1)) continue;
      const params = { ...SCORELINE_PARAMS[r.tour], tau: tauOverride ?? IN_MATCH_TAU[r.tour] };
      const path = setPath(r.pre_match_p1, bestOf, params, order);
      const a = acc[r.tour];
      // After the first set, against what happened (and the score-only version for comparison).
      const p = Math.min(1 - 1e-6, Math.max(1e-6, path[1]));
      const p0 = Math.min(1 - 1e-6, Math.max(1e-6, setPath(r.pre_match_p1, bestOf, { ...params, tau: 0 }, order.slice(0, 1))[1]));
      const won = r.winner_side === 1;
      a.n++;
      a.ll -= Math.log(won ? p : 1 - p);
      a.ll0 -= Math.log(won ? p0 : 1 - p0);
      // The favourite lost the first set: by pre-match bin.
      const favA = r.pre_match_p1 >= 0.5;
      const pFav = favA ? r.pre_match_p1 : 1 - r.pre_match_p1;
      if ((favA && order[0] === 2) || (!favA && order[0] === 1)) {
        const lo = Math.min(90, Math.floor((pFav * 100) / 10) * 10);
        const bin = `${lo}–${lo + 10}%`;
        const e = a.bins.get(bin) ?? { n: 0, p: 0, p0: 0, won: 0 };
        e.n++;
        e.p += favA ? path[1] : 1 - path[1];
        e.p0 += favA ? p0 : 1 - p0;
        e.won += (favA ? won : !won) ? 1 : 0;
        a.bins.set(bin, e);
      }
      const winner = r.winner_side as 1 | 2;
      const low = lowestForWinner(path, winner);
      if (low < 0.25) {
        const side = (n: 1 | 2) => ({ id: n === 1 ? r.player1_id : r.player2_id, name: (n === 1 ? r.player1_name : r.player2_name) ?? playerKey(null, ""), country: n === 1 ? r.player1_country : r.player2_country });
        a.all.push({
          matchId: r.id,
          season: r.season,
          tournament: r.tournaments.name,
          tournamentId: r.tournament_id,
          round: r.round,
          winner: side(winner),
          loser: side(winner === 1 ? 2 : 1),
          pre: winner === 1 ? r.pre_match_p1 : 1 - r.pre_match_p1,
          low,
          score: sets.map((x) => (winner === 1 ? `${x.p1}–${x.p2}` : `${x.p2}–${x.p1}`)).join(" "),
        });
      }
    }
    if (!rows || rows.length < BATCH) break;
  }

  for (const [tour, a] of Object.entries(acc)) {
    data.tours[tour] = {
      matches: a.n,
      logLoss: a.ll / Math.max(1, a.n),
      scoreOnlyLogLoss: a.ll0 / Math.max(1, a.n),
      afterFirstSet: [...a.bins]
        .sort((x, y) => x[0].localeCompare(y[0]))
        .filter(([, e]) => e.n >= 30)
        .map(([bin, e]) => ({ bin, matches: e.n, predicted: e.p / e.n, scoreOnly: e.p0 / e.n, actual: e.won / e.n })),
      greatest: a.all.sort((x, y) => x.low - y.low).slice(0, 30),
    };
  }
  const { error } = await db.from("stat_cache").upsert({ key: "lab:turnarounds", data: data as unknown as Json });
  if (error) throw new Error(`turnarounds: ${error.message}`);
  return Object.fromEntries(Object.entries(data.tours).map(([t, v]) => [t, `${v.matches} matches, ll ${v.logLoss.toFixed(4)} vs ${v.scoreOnlyLogLoss.toFixed(4)}`]));
}
