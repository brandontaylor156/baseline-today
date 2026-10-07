import "server-only";

import { auc, brier, fitModel, predict, type Example } from "@/lib/lab/breakthrough";
import { marginMultiplier, newRating, normalizeSurface, updateRatings, type Rating, type Surface } from "@/lib/model/elo";
import { playerKey } from "@/lib/model/load";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { normalizeName } from "@/lib/wiki/names";

import { loadMatches } from "./factors";

const DAY = 86_400_000;
const FEATURES = ["Rating", "Rating gained over the year", "Challenger wins", "Challenger titles", "Tour-level wins", "Age", "Age unknown"] as const;

export interface Prospect {
  key: string;
  id: number | null;
  name: string;
  country: string | null;
  age: number | null;
  rating: number;
  gain: number;
  challengerWins: number;
  titles: number;
  tourWins: number;
  /** Tour-level wins before today, all time in our data: first breakthrough or a return. */
  careerTourWins: number;
  chance: number;
}

export interface BreakthroughCache {
  generated: string;
  challengerResults: number;
  /** Held-out seasons: AUC and Brier of the full model and of rating alone; calibration by bin. */
  test: { seasons: number[]; candidates: number; breakthroughs: number; auc: number; brier: number; ratingAuc: number; ratingBrier: number; bins: { predicted: number; actual: number; n: number }[] };
  /** Standardized coefficients (log-odds per standard deviation). */
  weights: { feature: string; weight: number }[];
  /** Held-out examples: the highest chances given, and what happened. */
  hits: { name: string; season: number; chance: number; broke: boolean }[];
  prospects: Prospect[];
}

type Ev = { date: string; order: string; key1: string; key2: string; winner: 1 | 2; surface: Surface | null; share: number | null; level: "tour" | "chal"; final: boolean };

/**
 * Who breaks through to the tour? Tour and ATP Challenger results replayed together; each season
 * start, every active Challenger player with few tour wins gets a chance of 10+ tour-level wins
 * in the next two seasons, from a model trained on earlier seasons and tested on later ones.
 * Stored in stat_cache as lab:breakthrough. Weekly.
 */
export async function computeBreakthrough(db: AdminClient, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const { matches, who } = await loadMatches(db);
  // Names → keys: a Challenger name is the same player as a tour name (profiles win).
  const byName = new Map<string, string>();
  for (const [key, w] of who) {
    const n = normalizeName(w.name);
    if (!byName.has(n) || key.startsWith("id:")) byName.set(n, key);
  }
  const keyOf = (name: string) => byName.get(normalizeName(name)) ?? playerKey(null, name);

  const events: Ev[] = [];
  for (const m of matches.atp) {
    if (m.walkover) continue;
    const games = m.sets.reduce((s, [a, b]) => s + a + b, 0);
    const won = m.sets.reduce((s, [a, b]) => s + (m.winner === 1 ? a : b), 0);
    events.push({ date: m.startDate, order: `${m.startDate}|${String(m.round).padStart(2, "0")}|t`, key1: m.key1, key2: m.key2, winner: m.winner, surface: normalizeSurface(m.surface), share: !m.retired && games ? won / games : null, level: "tour", final: false });
  }
  let challengerResults = 0;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("challenger_matches")
      .select("id, round, round_rank, player1_name, player2_name, winner_side, set_scores, result_detail, challenger_events!inner(start_date, surface)")
      .not("challenger_events.start_date", "is", null)
      .eq("challenger_events.circuit", "challenger")
      .in("winner_side", [1, 2])
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`breakthrough: challengers: ${error.message}`);
    type C = { id: number; round: string | null; round_rank: number; player1_name: string; player2_name: string; winner_side: number; set_scores: unknown; result_detail: string | null; challenger_events: { start_date: string; surface: string | null } };
    for (const r of (data ?? []) as unknown as C[]) {
      if (r.result_detail === "walkover") continue;
      const sets = ((Array.isArray(r.set_scores) ? r.set_scores : []) as { p1: number | null; p2: number | null }[]).filter((x) => x.p1 !== null && x.p2 !== null);
      const games = sets.reduce((s, x) => s + x.p1! + x.p2!, 0);
      const won = sets.reduce((s, x) => s + (r.winner_side === 1 ? x.p1! : x.p2!), 0);
      events.push({
        date: r.challenger_events.start_date,
        order: `${r.challenger_events.start_date}|${String(r.round_rank).padStart(2, "0")}|c`,
        key1: keyOf(r.player1_name),
        key2: keyOf(r.player2_name),
        winner: r.winner_side as 1 | 2,
        surface: normalizeSurface(r.challenger_events.surface),
        share: !r.result_detail && games ? won / games : null,
        level: "chal",
        final: /^final$/i.test(r.round ?? ""),
      });
      challengerResults++;
    }
    if (!data || data.length < 1000) break;
  }
  events.sort((a, b) => a.order.localeCompare(b.order));

  // Replay; snapshot everyone's rating at each season start, a year before today, and today.
  const firstYear = 2016;
  const lastYear = now.getUTCFullYear();
  const cuts = [...Array.from({ length: lastYear - firstYear + 1 }, (_, i) => `${firstYear + i}-01-01`), new Date(now.getTime() - 365 * DAY).toISOString().slice(0, 10), today].sort();
  const snapshots = new Map<string, Map<string, number>>();
  const ratings = new Map<string, Rating>();
  const get = (k: string) => {
    let r = ratings.get(k);
    if (!r) ratings.set(k, (r = newRating()));
    return r;
  };
  let ci = 0;
  const snap = () => snapshots.set(cuts[ci], new Map([...ratings].map(([k, r]) => [k, r.overall])));
  for (const e of events) {
    while (ci < cuts.length && e.date >= cuts[ci]) {
      snap();
      ci++;
    }
    updateRatings(get(e.key1), get(e.key2), e.winner, e.surface, marginMultiplier(e.share));
  }
  while (ci < cuts.length) {
    snap();
    ci++;
  }

  // Births, for age.
  const births = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.rpc("lab_birth_dates", { p_tour: "atp" }).order("player_key").range(from, from + 999);
    for (const b of data ?? []) births.set(b.player_key, b.birth_date);
    if (!data || data.length < 1000) break;
  }

  // Per player, dated wins by level (and titles), for windows.
  const record = new Map<string, { date: string; level: "tour" | "chal"; won: boolean; title: boolean }[]>();
  for (const e of events) {
    for (const side of [1, 2] as const) {
      const k = side === 1 ? e.key1 : e.key2;
      const list = record.get(k) ?? [];
      list.push({ date: e.date, level: e.level, won: e.winner === side, title: e.final && e.winner === side });
      record.set(k, list);
    }
  }
  const window = (k: string, from: string, to: string) => {
    const xs = (record.get(k) ?? []).filter((r) => r.date >= from && r.date < to);
    return {
      chalMatches: xs.filter((r) => r.level === "chal").length,
      chalWins: xs.filter((r) => r.level === "chal" && r.won).length,
      titles: xs.filter((r) => r.title).length,
      tourWins: xs.filter((r) => r.level === "tour" && r.won).length,
    };
  };
  const shift = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

  const candidates = (at: string) => {
    const now_ = snapshots.get(at)!;
    const before = snapshots.get(shift(at, -365)) ?? snapshots.get(`${Number(at.slice(0, 4)) - 1}-01-01`) ?? new Map<string, number>();
    const out: { key: string; features: number[]; age: number | null; w: ReturnType<typeof window>; rating: number; gain: number }[] = [];
    for (const [k, rating] of now_) {
      const w = window(k, shift(at, -365), at);
      if (w.chalMatches < 10 || w.tourWins >= 5) continue;
      const b = births.get(k);
      const age = b ? (Date.parse(`${at}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / (365.25 * DAY) : null;
      const gain = rating - (before.get(k) ?? 1500);
      out.push({ key: k, rating, gain, age, w, features: [rating, gain, w.chalWins, w.titles, w.tourWins, age ?? 24, age === null ? 1 : 0] });
    }
    return out;
  };
  const outcome = (k: string, at: string) => (window(k, at, shift(at, 730)).tourWins >= 10 ? 1 : 0);

  const trainSeasons = [2017, 2018, 2019, 2020, 2021, 2022];
  const testSeasons = [2023, 2024].filter((y) => shift(`${y}-01-01`, 730) <= today);
  const examples = (years: number[]) =>
    years.flatMap((y) => candidates(`${y}-01-01`).map((c) => ({ key: c.key, season: y, ex: { features: c.features, y: outcome(c.key, `${y}-01-01`) as 0 | 1 } satisfies Example })));
  const train = examples(trainSeasons);
  const test = examples(testSeasons);
  const model = fitModel(train.map((t) => t.ex));
  const ratingOnly = fitModel(train.map((t) => ({ features: [t.ex.features[0]], y: t.ex.y })));
  const scored = test.map((t) => ({ p: predict(model, t.ex.features), y: t.ex.y, key: t.key, season: t.season }));
  const scoredRating = test.map((t) => ({ p: predict(ratingOnly, [t.ex.features[0]]), y: t.ex.y }));
  const edges = [0, 0.05, 0.15, 0.3, 0.5, 1.01];
  const bins = edges.slice(0, -1).map((lo, i) => {
    const xs = scored.filter((s) => s.p >= lo && s.p < edges[i + 1]);
    return { predicted: xs.reduce((s, x) => s + x.p, 0) / Math.max(1, xs.length), actual: xs.reduce((s, x) => s + x.y, 0) / Math.max(1, xs.length), n: xs.length };
  });

  // Today's prospects.
  const current = candidates(today)
    .map((c) => {
      const w = who.get(c.key);
      return {
        key: c.key,
        id: w?.id ?? null,
        name: w?.name ?? c.key.replace(/^name:/, ""),
        country: w?.country ?? null,
        age: c.age === null ? null : Math.round(c.age * 10) / 10,
        rating: Math.round(c.rating),
        gain: Math.round(c.gain),
        challengerWins: c.w.chalWins,
        titles: c.w.titles,
        tourWins: c.w.tourWins,
        careerTourWins: window(c.key, "2000-01-01", today).tourWins,
        chance: predict(model, c.features),
      };
    })
    .sort((a, b) => b.chance - a.chance)
    .slice(0, 80);

  const data: BreakthroughCache = {
    generated: now.toISOString(),
    challengerResults,
    test: {
      seasons: testSeasons,
      candidates: scored.length,
      breakthroughs: scored.filter((s) => s.y === 1).length,
      auc: auc(scored),
      brier: brier(scored),
      ratingAuc: auc(scoredRating),
      ratingBrier: brier(scoredRating),
      bins: bins.filter((b) => b.n > 0),
    },
    weights: FEATURES.map((feature, j) => ({ feature, weight: model.beta[j + 1] })),
    hits: [...scored]
      .sort((a, b) => b.p - a.p)
      .slice(0, 15)
      .map((s) => ({ name: who.get(s.key)?.name ?? s.key.replace(/^name:/, ""), season: s.season, chance: s.p, broke: s.y === 1 })),
    prospects: current,
  };
  const { error } = await db.from("stat_cache").upsert({ key: "lab:breakthrough", data: data as unknown as Json });
  if (error) throw new Error(`breakthrough: ${error.message}`);
  return `${challengerResults} Challenger results; test ${data.test.candidates} (${data.test.breakthroughs} broke through): AUC ${data.test.auc.toFixed(3)} vs rating ${data.test.ratingAuc.toFixed(3)}, Brier ${data.test.brier.toFixed(3)} vs ${data.test.ratingBrier.toFixed(3)}; top ${current.slice(0, 5).map((p) => `${p.name} ${(p.chance * 100).toFixed(0)}%`).join(", ")}`;
}
