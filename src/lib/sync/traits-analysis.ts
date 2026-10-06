import "server-only";

import { asRating, fitLogistic, type FactorRow } from "@/lib/lab/factors";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import { loadMatches } from "./factors";

const FROM = "2016-01-01";

export interface TraitEffect {
  key: string;
  label: string;
  /** Rating points (95% interval) on top of the model, and the matches it's measured on. */
  points: number;
  low: number;
  high: number;
  matches: number;
}

export interface TraitsCache {
  generated: string;
  tours: Record<
    string,
    {
      coverage: { players: number; hand: number; lefties: number; backhand: number; oneHanded: number; height: number };
      effects: TraitEffect[];
      /** Raw records (no model): left-handers against right-handers, and one-handed against two-handed backhands. */
      records: { label: string; wins: number; matches: number; expected: number }[];
    }
  >;
}

function effect(rows: FactorRow[], key: string, label: string): TraitEffect {
  const fit = fitLogistic(rows, [true]);
  const b = fit.beta[1];
  const se = fit.se[1];
  return { key, label, points: asRating(b), low: asRating(b - 1.96 * se), high: asRating(b + 1.96 * se), matches: rows.length };
}

/**
 * What playing hand, backhand and height are worth on top of the ratings, from every match since
 * 2016 between players whose traits Wikidata or their Wikipedia infobox record. Stored in
 * stat_cache as lab:traits. Weekly.
 */
export async function computeTraits(db: AdminClient, now = new Date()) {
  const traits = new Map<string, { hand: string | null; backhand: string | null; height: number | null }>();
  const tourOf: { player_key: string; tour: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("player_traits").select("player_key, tour, hand, backhand, height_cm").range(from, from + 999);
    if (error) throw new Error(`traits: load: ${error.message}`);
    for (const t of data ?? []) {
      traits.set(t.player_key, { hand: t.hand, backhand: t.backhand, height: t.height_cm });
      tourOf.push({ player_key: t.player_key, tour: t.tour });
    }
    if (!data || data.length < 1000) break;
  }
  const { matches } = await loadMatches(db);
  const data: TraitsCache = { generated: now.toISOString(), tours: {} };

  for (const tour of ["atp", "wta"] as const) {
    const mine = tourOf.filter((t) => t.tour === tour).map((t) => traits.get(t.player_key)!);
    const ms = matches[tour].filter((m) => !m.walkover && Number.isFinite(m.p1) && m.p1 > 0 && m.p1 < 1 && m.startDate >= FROM);
    const logit = (p: number) => Math.log(p / (1 - p));
    const rowsFor = (feature: (a: NonNullable<ReturnType<typeof traits.get>>, b: NonNullable<ReturnType<typeof traits.get>>) => number | null, keep: (date: string, surface: string | null) => boolean = () => true) =>
      ms.flatMap((m) => {
        const a = traits.get(m.key1);
        const b = traits.get(m.key2);
        if (!a || !b || !keep(m.startDate, m.surface)) return [];
        const x = feature(a, b);
        return x === null || x === 0 ? [] : [{ logit: logit(m.p1), x: [x], y: m.winner === 1 ? (1 as const) : (0 as const), date: m.startDate }];
      });
    const lefty = (a: { hand: string | null }, b: { hand: string | null }) => (a.hand && b.hand ? (a.hand === "left" ? 1 : 0) - (b.hand === "left" ? 1 : 0) : null);
    const oneHander = (a: { backhand: string | null }, b: { backhand: string | null }) => (a.backhand && b.backhand ? (a.backhand === "one" ? 1 : 0) - (b.backhand === "one" ? 1 : 0) : null);
    const taller = (a: { height: number | null }, b: { height: number | null }) => (a.height && b.height ? (a.height - b.height) / 10 : null);
    const clay = (s: string | null) => /clay/i.test(s ?? "");
    const grass = (s: string | null) => /grass/i.test(s ?? "");

    const effects: TraitEffect[] = [
      effect(rowsFor(lefty), "lefty", "Left-handed against a right-hander"),
      effect(rowsFor(lefty, (d) => d < "2021-01-01"), "lefty-early", "Left-handed, 2016–2020"),
      effect(rowsFor(lefty, (d) => d >= "2021-01-01"), "lefty-late", "Left-handed, 2021 on"),
      effect(rowsFor(oneHander), "one-handed", "One-handed backhand against a two-hander"),
      effect(rowsFor(taller), "height", "10 cm taller"),
      effect(rowsFor(taller, (_, s) => clay(s)), "height-clay", "10 cm taller, on clay"),
      effect(rowsFor(taller, (_, s) => grass(s)), "height-grass", "10 cm taller, on grass"),
    ];

    // Plain records, with the model's expected wins for comparison.
    type T = { hand: string | null; backhand: string | null; height: number | null };
    const record = (label: string, feature: (a: T, b: T) => number | null) => {
      let wins = 0;
      let n = 0;
      let expected = 0;
      for (const m of ms) {
        const a = traits.get(m.key1);
        const b = traits.get(m.key2);
        if (!a || !b) continue;
        const x = feature(a, b);
        if (!x) continue;
        const p = x > 0 ? m.p1 : 1 - m.p1;
        const won = (m.winner === 1) === x > 0;
        wins += won ? 1 : 0;
        expected += p;
        n++;
      }
      return { label, wins, matches: n, expected };
    };
    data.tours[tour] = {
      coverage: {
        players: mine.length,
        hand: mine.filter((t) => t?.hand).length,
        lefties: mine.filter((t) => t?.hand === "left").length,
        backhand: mine.filter((t) => t?.backhand).length,
        oneHanded: mine.filter((t) => t?.backhand === "one").length,
        height: mine.filter((t) => t?.height).length,
      },
      effects,
      records: [record("Left-handers against right-handers", lefty), record("One-handed backhands against two-handed", oneHander)],
    };
  }
  const { error } = await db.from("stat_cache").upsert({ key: "lab:traits", data: data as unknown as Json });
  if (error) throw new Error(`traits: ${error.message}`);
  return Object.fromEntries(Object.entries(data.tours).map(([t, v]) => [t, v.effects.map((e) => `${e.key} ${e.points.toFixed(1)} [${e.low.toFixed(0)},${e.high.toFixed(0)}] n${e.matches}`).join(" | ")]));
}
