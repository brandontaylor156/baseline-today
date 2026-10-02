import "server-only";

import { bestOfFive, calibrate, newRating, normalizeSurface, winProbability, type Rating } from "@/lib/model/elo";
import { playerKey } from "@/lib/model/load";
import { modelEdge, summarizeMarket, type Edge, type MarketSummary } from "@/lib/model/odds";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import { normalizeName } from "@/lib/wiki/names";
import { roundRank } from "@/lib/wiki/rows";

const DAY = 86400000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export interface ModelInfo {
  calibration: Record<string, number>;
  backtest: Record<
    string,
    { n: number; accuracy: number; logLoss: number; brier?: number; buckets?: { bucket: string; n: number; predicted: number; actual: number }[] }
  >;
  season: number | null;
  updatedAt: string | null;
}

type RatingRow = { tour: string; player_key: string; elo: number; elo_hard: number; elo_clay: number; elo_grass: number; matches: number; hard_matches: number; clay_matches: number; grass_matches: number };

function toRating(r: RatingRow | undefined): Rating {
  if (!r) return newRating();
  return {
    overall: r.elo,
    surface: { hard: r.elo_hard, clay: r.elo_clay, grass: r.elo_grass },
    matches: r.matches,
    surfaceMatches: { hard: r.hard_matches, clay: r.clay_matches, grass: r.grass_matches },
  };
}

export async function getModelInfo(): Promise<ModelInfo> {
  const db = createPublicClient();
  const { data } = await db.from("sync_state").select("details, last_refreshed_at").eq("key", "model").maybeSingle();
  const d = (data?.details ?? {}) as Partial<ModelInfo>;
  return { calibration: d.calibration ?? {}, backtest: d.backtest ?? {}, season: d.season ?? null, updatedAt: data?.last_refreshed_at ?? null };
}

export interface Side {
  id: number | null;
  name: string;
  countryCode: string | null;
  rank: number | null;
}

export interface Matchup {
  id: number;
  tour: Tour;
  tournament: { id: number; name: string; category: string | null; surface: string | null };
  round: string | null;
  scheduledAt: string | null;
  p1: Side;
  p2: Side;
  /** Calibrated model probability that player 1 wins. */
  model1: number;
  /** How much history the model has on the less-known player (low = treat with care). */
  minMatches: number;
  market: MarketSummary;
  edge: Edge | null;
}

/** Model win probability for two players (for head-to-head pages). */
export async function predictPair(tour: Tour, a: number, b: number, surface: string | null): Promise<{ p: number; minMatches: number } | null> {
  const db = createPublicClient();
  const [{ data: rows }, info] = await Promise.all([
    db.from("player_ratings").select("*").eq("tour", tour).in("player_key", [playerKey(a, null), playerKey(b, null)]),
    getModelInfo(),
  ]);
  const byKey = new Map(((rows ?? []) as RatingRow[]).map((r) => [r.player_key, r]));
  const ra = byKey.get(playerKey(a, null));
  const rb = byKey.get(playerKey(b, null));
  if (!ra || !rb) return null;
  const p = calibrate(winProbability(toRating(ra), toRating(rb), normalizeSurface(surface)), info.calibration[tour] ?? 1);
  return { p, minMatches: Math.min(ra.matches, rb.matches) };
}

export interface UpcomingFilter {
  /** Read through the data cache (for cached pages); default false. */
  cached?: boolean;
  tournamentId?: number;
  playerIds?: number[];
}

/** Upcoming matches (draw pairings and provider schedules) with model probabilities and odds. */
export async function getUpcoming(now = new Date(), filter: UpcomingFilter = {}): Promise<{ matchups: Matchup[]; info: ModelInfo }> {
  const db = createPublicClient({ cached: filter.cached ?? false });
  if (filter.playerIds && filter.playerIds.length === 0) return { matchups: [], info: await getModelInfo() };
  let query = db
    .from("matches")
    .select(
      `id, provider, tour, round, scheduled_at, player1_id, player2_id, player1_name, player2_name, player1_country, player2_country,
       tournaments!inner(id, name, category, surface, start_date, end_date),
       p1:players!matches_player1_id_fkey(id, full_name, country_code),
       p2:players!matches_player2_id_fkey(id, full_name, country_code)`,
    )
    .eq("status", "scheduled")
    .eq("confirmed", true)
    .gte("tournaments.end_date", isoDate(now))
    .lte("tournaments.start_date", isoDate(new Date(now.getTime() + 7 * DAY)));
  if (filter.tournamentId !== undefined) query = query.eq("tournament_id", filter.tournamentId);
  if (filter.playerIds) {
    const ids = filter.playerIds.join(",");
    query = query.or(`player1_id.in.(${ids}),player2_id.in.(${ids})`);
  }
  const { data, error } = await query.limit(500);
  if (error) throw new Error(`upcoming: ${error.message}`);

  type Row = {
    id: number;
    provider: string;
    tour: Tour;
    round: string | null;
    scheduled_at: string | null;
    player1_id: number | null;
    player2_id: number | null;
    player1_name: string | null;
    player2_name: string | null;
    player1_country: string | null;
    player2_country: string | null;
    tournaments: { id: number; name: string; category: string | null; surface: string | null };
    p1: { id: number; full_name: string; country_code: string | null } | null;
    p2: { id: number; full_name: string; country_code: string | null } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  // Prefer the provider's copy of a match when both sources list it.
  const nameKey = (r: Row) => `${r.tournaments.id}|${[r.p1?.full_name ?? r.player1_name, r.p2?.full_name ?? r.player2_name].map((n) => normalizeName(n ?? "")).sort().join("|")}`;
  const providerKeys = new Set(rows.filter((r) => r.provider !== "wikipedia").map(nameKey));
  const unique = rows.filter((r) => r.provider !== "wikipedia" || !providerKeys.has(nameKey(r)));

  const keys = [...new Set(unique.flatMap((r) => [playerKey(r.player1_id, r.player1_name), playerKey(r.player2_id, r.player2_name)]))];
  const ids = unique.map((r) => r.id);
  const playerIds = [...new Set(unique.flatMap((r) => [r.player1_id, r.player2_id]).filter((x): x is number => x !== null))];
  const [ratings, odds, ranks, info] = await Promise.all([
    keys.length ? db.from("player_ratings").select("*").in("player_key", keys) : Promise.resolve({ data: [] }),
    ids.length ? db.from("odds").select("match_id, vendor, player1_odds, player2_odds").in("match_id", ids) : Promise.resolve({ data: [] }),
    playerIds.length
      ? db.from("rankings").select("player_id, rank, ranking_date").in("player_id", playerIds).order("ranking_date", { ascending: false }).limit(playerIds.length * 3)
      : Promise.resolve({ data: [] }),
    getModelInfo(),
  ]);
  const ratingOf = new Map(((ratings.data ?? []) as RatingRow[]).map((r) => [`${r.tour}|${r.player_key}`, r]));
  const oddsBy = new Map<number, { vendor: string; p1: number | null; p2: number | null }[]>();
  for (const o of (odds.data ?? []) as { match_id: number; vendor: string; player1_odds: number | null; player2_odds: number | null }[]) {
    oddsBy.set(o.match_id, [...(oddsBy.get(o.match_id) ?? []), { vendor: o.vendor, p1: o.player1_odds, p2: o.player2_odds }]);
  }
  const rankOf = new Map<number, number>();
  for (const r of (ranks.data ?? []) as { player_id: number; rank: number }[]) if (!rankOf.has(r.player_id)) rankOf.set(r.player_id, r.rank);

  const matchups = unique.map((r): Matchup => {
    const k1 = playerKey(r.player1_id, r.player1_name);
    const k2 = playerKey(r.player2_id, r.player2_name);
    const r1 = ratingOf.get(`${r.tour}|${k1}`);
    const r2 = ratingOf.get(`${r.tour}|${k2}`);
    const base = calibrate(winProbability(toRating(r1), toRating(r2), normalizeSurface(r.tournaments.surface)), info.calibration[r.tour] ?? 1);
    const model1 = r.tour === "atp" && /grand slam/i.test(r.tournaments.category ?? "") ? bestOfFive(base) : base;
    const market = summarizeMarket(oddsBy.get(r.id) ?? []);
    const side = (p: Row["p1"], id: number | null, name: string | null, country: string | null): Side => ({
      id: p?.id ?? id,
      name: p?.full_name ?? name ?? "TBD",
      countryCode: p?.country_code ?? country,
      rank: p ? (rankOf.get(p.id) ?? null) : null,
    });
    return {
      id: r.id,
      tour: r.tour,
      tournament: r.tournaments,
      round: r.round,
      scheduledAt: r.scheduled_at,
      p1: side(r.p1, r.player1_id, r.player1_name, r.player1_country),
      p2: side(r.p2, r.player2_id, r.player2_name, r.player2_country),
      model1,
      minMatches: Math.min(r1?.matches ?? 0, r2?.matches ?? 0),
      market,
      edge: modelEdge(model1, market),
    };
  });

  matchups.sort(
    (a, b) =>
      (a.scheduledAt ?? "9").localeCompare(b.scheduledAt ?? "9") ||
      a.tournament.name.localeCompare(b.tournament.name) ||
      roundRank(a.round) - roundRank(b.round),
  );
  return { matchups, info };
}
