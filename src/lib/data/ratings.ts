import "server-only";

import { cache } from "react";

import type { Tour } from "@/lib/provider/types";
import type { RatedPlayer } from "@/lib/ratings";
import { createPublicClient } from "@/lib/supabase/public";

import { getRankingDates, getRankings } from "./tennis";

/** Players count as active if they played a tracked match within this many days. */
const ACTIVE_DAYS = 365;

/** Model ratings of a tour's active players, with this week's ranking (top 100) where they have one. */
export const getRatedPlayers = cache(async (tour: Tour): Promise<RatedPlayer[]> => {
  const since = new Date(Date.now() - ACTIVE_DAYS * 86400000).toISOString().slice(0, 10);
  const db = createPublicClient();
  const [{ data, error }, dates] = await Promise.all([
    db
      .from("player_ratings")
      .select("player_key, player_id, name, elo, elo_hard, elo_clay, elo_grass, matches, hard_matches, clay_matches, grass_matches, players(full_name, country_code)")
      .eq("tour", tour)
      .gte("last_played", since)
      .order("elo", { ascending: false })
      .limit(1000),
    getRankingDates(tour),
  ]);
  if (error) throw new Error(`ratings: ${error.message}`);
  const rankings = dates[0] ? await getRankings(tour, dates[0]) : [];
  const rankOf = new Map(rankings.map((r) => [r.player.id, r.rank]));

  return (data ?? []).map((r) => ({
    key: r.player_key,
    id: r.player_id,
    // Unlinked players keep the normalized name from the results: show it in title case.
    name: r.players?.full_name ?? (r.name ?? r.player_key).replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase()),
    countryCode: r.players?.country_code ?? null,
    elo: r.elo,
    surface: { hard: r.elo_hard, clay: r.elo_clay, grass: r.elo_grass },
    matches: r.matches,
    surfaceMatches: { hard: r.hard_matches, clay: r.clay_matches, grass: r.grass_matches },
    rank: r.player_id !== null ? (rankOf.get(r.player_id) ?? null) : null,
  }));
});
