import "server-only";

import { cache } from "react";

import { createPublicClient } from "@/lib/supabase/public";
import type { Tour } from "@/lib/provider/types";

// All reads here come from our database (never the provider) via the cached public client.

export interface PlayerImage {
  imageUrl: string;
  sourceUrl: string;
  author: string;
  license: string;
  licenseUrl: string | null;
}

export interface RankingRow {
  rank: number;
  points: number | null;
  movement: number | null;
  player: {
    id: number;
    fullName: string;
    countryCode: string | null;
    image: PlayerImage | null;
  };
}

function toImage(
  img: { image_url: string; source_url: string; author: string; license: string; license_url: string | null } | null,
): PlayerImage | null {
  return img
    ? { imageUrl: img.image_url, sourceUrl: img.source_url, author: img.author, license: img.license, licenseUrl: img.license_url }
    : null;
}

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

export const getRankingDates = cache(async (tour: Tour): Promise<string[]> => {
  const db = createPublicClient();
  return check(await db.rpc("ranking_dates", { p_tour: tour }, { get: true }), "ranking dates") ?? [];
});

export const getRankings = cache(async (tour: Tour, date: string): Promise<RankingRow[]> => {
  const db = createPublicClient();
  const rows = check(
    await db
      .from("rankings")
      .select("rank, points, movement, players!inner(id, full_name, country_code, player_images(image_url, source_url, author, license, license_url))")
      .eq("tour", tour)
      .eq("ranking_date", date)
      .order("rank"),
    "rankings",
  );
  return rows.map((r) => ({
    rank: r.rank,
    points: r.points,
    movement: r.movement,
    player: {
      id: r.players.id,
      fullName: r.players.full_name,
      countryCode: r.players.country_code,
      image: toImage(r.players.player_images),
    },
  }));
});

export interface PlayerDetail {
  id: number;
  tour: Tour;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  countryCode: string | null;
  countryName: string | null;
  birthPlace: string | null;
  birthDate: string | null;
  plays: string | null;
  heightCm: number | null;
  weightKg: number | null;
  turnedPro: number | null;
  image: PlayerImage | null;
  /** Rank history from our snapshots, oldest first. */
  history: { date: string; rank: number; points: number | null }[];
  favoriteCount: number;
}

export const getPlayer = cache(async (id: number): Promise<PlayerDetail | null> => {
  const db = createPublicClient();
  const { data: p, error } = await db
    .from("players")
    .select("*, player_images(image_url, source_url, author, license, license_url)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`player: ${error.message}`);
  if (!p) return null;

  const [history, favorites] = await Promise.all([
    db.from("rankings").select("ranking_date, rank, points").eq("player_id", id).order("ranking_date"),
    db.rpc("player_favorite_count", { p_player_id: id }, { get: true }),
  ]);

  return {
    id: p.id,
    tour: p.tour as Tour,
    fullName: p.full_name,
    firstName: p.first_name,
    lastName: p.last_name,
    countryCode: p.country_code,
    countryName: p.country_name,
    birthPlace: p.birth_place,
    birthDate: p.birth_date,
    plays: p.plays,
    heightCm: p.height_cm,
    weightKg: p.weight_kg,
    turnedPro: p.turned_pro,
    image: toImage(p.player_images),
    history: check(history, "ranking history").map((h) => ({ date: h.ranking_date, rank: h.rank, points: h.points })),
    favoriteCount: check(favorites, "favorite count") ?? 0,
  };
});

export interface Credit extends PlayerImage {
  playerId: number;
  playerName: string;
}

export const getCredits = cache(async (): Promise<Credit[]> => {
  const db = createPublicClient();
  const rows = check(
    await db
      .from("player_images")
      .select("image_url, source_url, author, license, license_url, players!inner(id, full_name)")
      .order("player_id"),
    "credits",
  );
  return rows
    .map((r) => ({ ...toImage(r)!, playerId: r.players.id, playerName: r.players.full_name }))
    .sort((a, b) => a.playerName.localeCompare(b.playerName));
});

export interface SearchResult {
  id: number;
  tour: Tour;
  fullName: string;
  countryCode: string | null;
  currentRank: number | null;
}

export async function searchPlayers(query: string, limit = 8): Promise<SearchResult[]> {
  if (query.trim().length < 2) return [];
  const db = createPublicClient();
  const rows = check(await db.rpc("search_players", { p_query: query, p_limit: limit }, { get: true }), "search");
  return (rows ?? []).map((r) => ({
    id: r.id,
    tour: r.tour as Tour,
    fullName: r.full_name,
    countryCode: r.country_code,
    currentRank: r.current_rank,
  }));
}
