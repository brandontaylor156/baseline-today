// Pure mapping from BALLDONTLIE responses to our types. Kept separate from the HTTP client so
// it can be unit tested without the "server-only" guard or network access.

import type { ProviderPlayer, ProviderRanking, Tour } from "./types";

export interface BdlPlayer {
  id: number;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  country: string | null;
  country_code: string | null;
  birth_place: string | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  plays: string | null;
  turned_pro: number | null;
}

export interface BdlRanking {
  id: number;
  player: BdlPlayer;
  rank: number;
  points: number | null;
  movement: number | null;
  ranking_date: string;
}

export interface BdlPage<T> {
  data: T[];
  meta: { next_cursor?: number | null; per_page: number };
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function mapPlayer(tour: Tour, p: BdlPlayer): ProviderPlayer {
  const firstName = clean(p.first_name);
  const lastName = clean(p.last_name);
  const fullName =
    clean(p.full_name) ?? ([firstName, lastName].filter(Boolean).join(" ") || `Player ${p.id}`);

  return {
    tour,
    providerId: p.id,
    firstName,
    lastName,
    fullName,
    countryCode: clean(p.country_code)?.toUpperCase() ?? null,
    countryName: clean(p.country),
    birthPlace: clean(p.birth_place),
    plays: clean(p.plays),
    heightCm: positive(p.height_cm),
    weightKg: positive(p.weight_kg),
    turnedPro: positive(p.turned_pro),
  };
}

/**
 * Keeps only the newest ranking date and the best `limit` ranks, in rank order.
 * The endpoint can return several dates; mixing them would corrupt a snapshot.
 */
export function mapLatestRankings(tour: Tour, rows: BdlRanking[], limit: number): ProviderRanking[] {
  if (rows.length === 0) return [];
  const latest = rows.reduce((max, r) => (r.ranking_date > max ? r.ranking_date : max), "");

  return rows
    .filter((r) => r.ranking_date === latest && r.rank > 0 && r.rank <= limit)
    .sort((a, b) => a.rank - b.rank)
    .map((r) => ({
      tour,
      rankingDate: r.ranking_date,
      rank: r.rank,
      points: r.points ?? null,
      movement: r.movement ?? null,
      player: mapPlayer(tour, r.player),
    }));
}
