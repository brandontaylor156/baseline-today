import "server-only";

import { cache } from "react";

import { createPublicClient } from "@/lib/supabase/public";

export interface Rate {
  key: string;
  matches: number;
  upsets: number;
  /** The favorite's average pre-match chance in this group. */
  favoriteChance: number;
}

export interface UpsetRates {
  all: Rate | null;
  recent: Rate | null;
  tour: Rate[];
  surface: Rate[];
  round: Rate[];
  season: Rate[];
}

/** How often the model's favorite lost, by tour, surface, round and season (since 2016). */
export const getUpsetRates = cache(async (): Promise<UpsetRates> => {
  const { data, error } = await createPublicClient().rpc("upset_rates", { p_from_season: 2016 });
  if (error) throw new Error(`upset rates: ${error.message}`);
  const rows = (data ?? []).map((r) => ({ dim: r.dimension, rate: { key: r.key, matches: r.matches, upsets: r.upsets, favoriteChance: r.favorite_chance } }));
  const of = (dim: string) => rows.filter((r) => r.dim === dim).map((r) => r.rate);
  return {
    all: of("all")[0] ?? null,
    recent: of("recent")[0] ?? null,
    tour: of("tour").sort((a, b) => a.key.localeCompare(b.key)),
    surface: of("surface").sort((a, b) => b.matches - a.matches),
    // Keys are "1 Final" … "7 First round": sorted by the number, shown without it.
    round: of("round")
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((r) => ({ ...r, key: r.key.replace(/^\d /, "") }))
      .reverse(),
    season: of("season").sort((a, b) => a.key.localeCompare(b.key)),
  };
});

export interface AccuracyRow {
  season: number;
  tour: string;
  surface: string;
  matches: number;
  correct: number;
  brier: number;
  ranked: number;
  rankedModelCorrect: number;
  rankedRankCorrect: number;
}

/** The model's record by season, tour and surface, with the "higher-ranked wins" baseline (2025+). */
export const getModelAccuracy = cache(async (): Promise<AccuracyRow[]> => {
  const { data, error } = await createPublicClient().rpc("model_accuracy");
  if (error) throw new Error(`model accuracy: ${error.message}`);
  return (data ?? []).map((r) => ({
    season: r.season,
    tour: r.tour,
    surface: r.surface,
    matches: r.matches,
    correct: r.correct,
    brier: r.brier,
    ranked: r.ranked,
    rankedModelCorrect: r.ranked_model_correct,
    rankedRankCorrect: r.ranked_rank_correct,
  }));
});

export interface PastFinal {
  matchId: number;
  season: number | null;
  tour: string;
  tournamentId: number;
  tournament: string;
  category: string | null;
  winner: { id: number | null; name: string };
  loser: { id: number | null; name: string };
  score: string;
}

/** Finals that ended on this calendar day in earlier seasons, newest first. */
export const getFinalsOnDay = cache(async (month: number, day: number): Promise<PastFinal[]> => {
  const { data, error } = await createPublicClient().rpc("finals_on_day", { p_month: month, p_day: day });
  if (error) throw new Error(`on this day: ${error.message}`);
  return (data ?? []).map((r) => {
    const sets = (Array.isArray(r.set_scores) ? r.set_scores : []) as { p1: number | null; p2: number | null }[];
    const score = sets
      .filter((s) => s.p1 !== null && s.p2 !== null)
      .map((s) => (r.winner_side === 1 ? `${s.p1}-${s.p2}` : `${s.p2}-${s.p1}`))
      .join(" ");
    return {
      matchId: r.match_id,
      season: r.season,
      tour: r.tour,
      tournamentId: r.tournament_id,
      tournament: r.tournament,
      category: r.category,
      winner: { id: r.winner_id, name: r.winner ?? "Unknown" },
      loser: { id: r.loser_id, name: r.loser ?? "Unknown" },
      score,
    };
  });
});
