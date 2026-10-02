// Pure mapping from BALLDONTLIE responses to our types. Kept separate from the HTTP client so
// it can be unit tested without the "server-only" guard or network access.

import type {
  MatchStatus,
  ProviderMatch,
  ProviderPlayer,
  ProviderRanking,
  ProviderTournament,
  SetScore,
  Tour,
} from "./types";

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

export interface BdlTournament {
  id: number;
  name: string | null;
  location: string | null;
  surface: string | null;
  category: string | null;
  season: number | null;
  start_date: string | null;
  end_date: string | null;
  prize_money?: number | null;
  prize_currency?: string | null;
  draw_size: number | null;
}

export interface BdlSetScore {
  set_number: number;
  player1_games: number | null;
  player2_games: number | null;
  player1_tiebreak: number | null;
  player2_tiebreak: number | null;
}

export interface BdlMatch {
  id: number;
  tournament: BdlTournament;
  season: number | null;
  round: string | null;
  player1: BdlPlayer | null;
  player2: BdlPlayer | null;
  winner: BdlPlayer | null;
  score: string | null;
  set_scores: BdlSetScore[] | null;
  player1_game_score: string | number | null;
  player2_game_score: string | number | null;
  /** Undocumented shape ("current server info"); normalized to a string. */
  server: unknown;
  duration: string | null;
  number_of_sets: number | null;
  match_status: string | null;
  status_state: string | null;
  is_live: boolean | null;
  scheduled_time: string | null;
  not_before_text: string | null;
}

export interface BdlPage<T> {
  data: T[];
  meta: { next_cursor?: number | null; per_page: number };
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim();
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

export function mapTournament(tour: Tour, t: BdlTournament): ProviderTournament {
  return {
    tour,
    providerId: t.id,
    name: clean(t.name) ?? `Tournament ${t.id}`,
    location: clean(t.location),
    surface: clean(t.surface),
    category: clean(t.category),
    season: positive(t.season),
    startDate: clean(t.start_date),
    endDate: clean(t.end_date),
    drawSize: positive(t.draw_size),
  };
}

const STATUSES: readonly MatchStatus[] = [
  "scheduled",
  "in_progress",
  "final",
  "postponed",
  "canceled",
  "delayed",
  "suspended",
  "abandoned",
  "unknown",
];

/** status_state is the provider's consistent lifecycle; fall back to match_status. */
export function mapStatus(statusState: string | null, matchStatus: string | null): MatchStatus {
  const s = statusState?.trim().toLowerCase();
  if (s && (STATUSES as readonly string[]).includes(s)) return s as MatchStatus;
  switch (matchStatus?.trim().toLowerCase()) {
    case "finished":
    case "walkover":
    case "retired":
    case "defaulted":
      return "final";
    case "in_progress":
      return "in_progress";
    case "scheduled":
      return "scheduled";
    case "suspended":
      return "suspended";
    default:
      return "unknown";
  }
}

function gameScore(value: string | number | null): string | null {
  if (value === null || value === undefined) return null;
  return clean(String(value));
}

function serverText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return clean(String(value));
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    const candidate = v.full_name ?? v.name ?? v.id ?? v.player;
    return candidate === undefined || candidate === null ? JSON.stringify(value).slice(0, 80) : clean(String(candidate));
  }
  return null;
}

export function mapMatch(tour: Tour, m: BdlMatch): ProviderMatch {
  const winnerId = m.winner?.id;
  const winner: 1 | 2 | null =
    winnerId === undefined ? null : winnerId === m.player1?.id ? 1 : winnerId === m.player2?.id ? 2 : null;
  const detail = clean(m.match_status)?.toLowerCase() ?? null;
  const sets: SetScore[] = (m.set_scores ?? [])
    .slice()
    .sort((a, b) => a.set_number - b.set_number)
    .map((s) => ({
      set: s.set_number,
      p1: s.player1_games ?? null,
      p2: s.player2_games ?? null,
      p1Tiebreak: s.player1_tiebreak ?? null,
      p2Tiebreak: s.player2_tiebreak ?? null,
    }));

  return {
    tour,
    providerId: m.id,
    tournament: mapTournament(tour, m.tournament),
    season: positive(m.season),
    round: clean(m.round),
    player1: m.player1 ? mapPlayer(tour, m.player1) : null,
    player2: m.player2 ? mapPlayer(tour, m.player2) : null,
    winner,
    status: mapStatus(m.status_state, m.match_status),
    resultDetail: detail && ["walkover", "retired", "defaulted"].includes(detail) ? detail : null,
    isLive: m.is_live === true,
    score: clean(m.score),
    sets,
    p1GameScore: gameScore(m.player1_game_score),
    p2GameScore: gameScore(m.player2_game_score),
    server: serverText(m.server),
    scheduledAt: clean(m.scheduled_time),
    notBeforeText: clean(m.not_before_text),
    duration: clean(m.duration),
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
