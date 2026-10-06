import "server-only";

import { cache } from "react";

import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";

import { displayName } from "./tournaments";

export interface LuckRow {
  id: number;
  name: string;
  country: string | null;
  entries: number;
  expected: number;
  titles: number;
}

export const getLuck = cache(async (tour: Tour): Promise<LuckRow[]> => {
  const { data, error } = await createPublicClient().rpc("lab_luck", { p_tour: tour, p_since: 2015 });
  if (error) throw new Error(`lab luck: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.player_id, name: r.name, country: r.country, entries: r.entries, expected: r.expected, titles: r.titles }));
});

export interface Extreme {
  tournamentId: number;
  tournament: string;
  category: string | null;
  season: number;
  id: number | null;
  name: string;
  country: string | null;
  chance: number;
}

export const getTitleExtremes = cache(async (tour: Tour, champions: boolean, limit = 15): Promise<Extreme[]> => {
  const { data, error } = await createPublicClient().rpc("lab_title_extremes", { p_tour: tour, p_champions: champions, p_limit: limit });
  if (error) throw new Error(`lab extremes: ${error.message}`);
  return (data ?? []).map((r) => ({
    tournamentId: r.tournament_id,
    tournament: displayName(r.tournament),
    category: r.category,
    season: r.season,
    id: r.player_id,
    name: r.name,
    country: r.country,
    chance: r.chance,
  }));
});

export interface Peak {
  id: number;
  name: string;
  country: string | null;
  peak: number;
  week: string;
  surface: { hard: number; clay: number; grass: number };
}

export const getPeaks = cache(async (tour: Tour): Promise<Peak[]> => {
  const { data, error } = await createPublicClient().rpc("lab_peaks", { p_tour: tour });
  if (error) throw new Error(`lab peaks: ${error.message}`);
  return (data ?? [])
    .map((r) => ({ id: r.player_id, name: r.name, country: r.country, peak: r.peak, week: r.week, surface: { hard: r.hard, clay: r.clay, grass: r.grass } }))
    .sort((a, b) => b.peak - a.peak);
});

export interface AgePoint {
  age: number;
  /** Players followed from this age to the next. */
  players: number;
  /** Average rating change (against the field) from this age to the next. */
  delta: number;
}

export const getAging = cache(async (tour: Tour): Promise<AgePoint[]> => {
  const { data, error } = await createPublicClient().rpc("lab_aging", { p_tour: tour });
  if (error) throw new Error(`lab aging: ${error.message}`);
  return (data ?? []).map((r) => ({ age: r.age, players: r.players, delta: r.delta }));
});

export interface RatingWeek {
  week: string;
  overall: number;
  hard: number;
  clay: number;
  grass: number;
  matches: number;
}

/** A player's rating after each week they played, oldest first. */
export const getRatingWeeks = cache(async (playerId: number): Promise<RatingWeek[]> => {
  const { data, error } = await createPublicClient()
    .from("lab_ratings")
    .select("week, overall, hard, clay, grass, matches")
    .eq("player_id", playerId)
    .order("week")
    .limit(1000);
  if (error) throw new Error(`lab ratings: ${error.message}`);
  return data ?? [];
});
