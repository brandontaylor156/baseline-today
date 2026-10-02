import "server-only";

import { cache } from "react";

import { titleChances } from "@/lib/draw-model";
import { bestOfFive, calibrate, newRating, normalizeSurface, winProbability, type Rating } from "@/lib/model/elo";
import { playerKey } from "@/lib/model/load";
import { summarizeMarket, type MarketSummary } from "@/lib/model/odds";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";

import { getHeadToHead, type HeadToHead } from "./h2h";
import { getModelInfo } from "./predictions";
import { getPlayerResults, RESULT_SELECT, toResult, type Result, type ResultRow } from "./results";
import { getDrawModel } from "./title-odds";

export interface PreviewSide {
  key: string;
  id: number | null;
  name: string;
  countryCode: string | null;
  rank: number | null;
  rating: number | null;
  form: { w: number; l: number; recent: ("W" | "L")[] } | null;
  /** Title chance now, and if they win this match (scheduled matches in a readable draw). */
  title: { now: number; ifWin: number } | null;
}

export interface MatchPreview {
  match: Result;
  tour: Tour;
  surface: string | null;
  category: string | null;
  scheduled: boolean;
  a: PreviewSide;
  b: PreviewSide;
  /** Model chance that side A wins: before the match for results, today for scheduled matches. */
  chanceA: number | null;
  bySurface: { surface: string; p: number }[];
  h2h: HeadToHead | null;
  market: MarketSummary | null;
  /** Market's margin-free chance for side A over time (when prices were stored). */
  marketHistory: { at: string; p: number }[];
  /** AI-written recap (finals and semifinals, when enabled). */
  recap: { body: string; model: string } | null;
}

type RatingRow = { player_key: string; elo: number; elo_hard: number; elo_clay: number; elo_grass: number; matches: number; hard_matches: number; clay_matches: number; grass_matches: number };
const toRating = (r: RatingRow): Rating => ({
  overall: r.elo,
  surface: { hard: r.elo_hard, clay: r.elo_clay, grass: r.elo_grass },
  matches: r.matches,
  surfaceMatches: { hard: r.hard_matches, clay: r.clay_matches, grass: r.grass_matches },
});

async function formOf(id: number | null, before: string | null) {
  if (id === null) return null;
  const res = await getPlayerResults(id);
  const recent = res.recent
    .filter((r) => r.resultDetail !== "walkover" && r.winner !== null && (!before || (r.tournamentStart ?? "") <= before))
    .slice(0, 10)
    .map((r) => (r.winner === (r.player1?.id === id ? 1 : 2) ? "W" : "L") as "W" | "L");
  return { w: res.wins, l: res.losses, recent };
}

/** Everything for a match page: players, chances, head-to-head, form, odds, title stakes. */
export const getMatchPreview = cache(async (matchId: number): Promise<MatchPreview | null> => {
  const db = createPublicClient();
  const { data, error } = await db
    .from("matches")
    .select(`${RESULT_SELECT}, pre_match_p1, player1_id, player2_id`)
    .eq("id", matchId)
    .eq("confirmed", true)
    .maybeSingle();
  if (error) throw new Error(`match: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as ResultRow & { pre_match_p1: number | null; player1_id: number | null; player2_id: number | null };
  const match = toResult(row);
  if (!match.player1 || !match.player2) return null;
  const tour = match.tour;
  const { data: t } = await db.from("tournaments").select("surface").eq("id", match.tournament.id).maybeSingle();
  const surface = t?.surface ?? null;
  const scheduled = match.status === "scheduled";
  const keyA = playerKey(row.player1_id, match.player1.name);
  const keyB = playerKey(row.player2_id, match.player2.name);

  const [info, ratings, ranks, odds, oddsHistory, recap, model] = await Promise.all([
    getModelInfo(),
    db.from("player_ratings").select("player_key, elo, elo_hard, elo_clay, elo_grass, matches, hard_matches, clay_matches, grass_matches").eq("tour", tour).in("player_key", [keyA, keyB]),
    db
      .from("rankings")
      .select("player_id, rank, ranking_date")
      .in("player_id", [row.player1_id, row.player2_id].filter((x): x is number => x !== null).concat(-1))
      .order("ranking_date", { ascending: false })
      .limit(10),
    db.from("odds").select("vendor, player1_odds, player2_odds").eq("match_id", matchId),
    db.from("odds_history").select("vendor, taken_at, player1_odds, player2_odds").eq("match_id", matchId).order("taken_at"),
    db.from("match_recaps").select("body, model").eq("match_id", matchId).maybeSingle(),
    scheduled ? getDrawModel(match.tournament.id) : Promise.resolve(null),
  ]);
  const ratingOf = new Map(((ratings.data ?? []) as RatingRow[]).map((r) => [r.player_key, r]));
  const rankOf = new Map<number, number>();
  for (const r of ranks.data ?? []) if (!rankOf.has(r.player_id)) rankOf.set(r.player_id, r.rank);
  const c = info.calibration[tour] ?? 1;
  const ra = ratingOf.get(keyA);
  const rb = ratingOf.get(keyB);
  const fiveSets = tour === "atp" && /grand slam/i.test(row.tournaments.category ?? "");
  const p = (s: string | null) => {
    const q = calibrate(winProbability(ra ? toRating(ra) : newRating(), rb ? toRating(rb) : newRating(), normalizeSurface(s)), c);
    return fiveSets ? bestOfFive(q) : q;
  };
  const haveRatings = Boolean(ra && rb);

  // Title stakes: chance now, and if each wins this match.
  let titleA: PreviewSide["title"] = null;
  let titleB: PreviewSide["title"] = null;
  if (model) {
    const inDraw = (k: string) => model.players.some((pl) => pl.key === k);
    const now = titleChances(model);
    if (now && inDraw(keyA) && inDraw(keyB)) {
      const t = (odds: ReturnType<typeof titleChances>, k: string) => odds?.players.find((x) => x.key === k)?.title ?? 0;
      titleA = { now: t(now, keyA), ifWin: t(titleChances(model, [{ winner: keyA, loser: keyB }]), keyA) };
      titleB = { now: t(now, keyB), ifWin: t(titleChances(model, [{ winner: keyB, loser: keyA }]), keyB) };
    }
  }

  const [formA, formB, h2h] = await Promise.all([
    formOf(row.player1_id, scheduled ? null : row.tournaments.start_date),
    formOf(row.player2_id, scheduled ? null : row.tournaments.start_date),
    row.player1_id !== null && row.player2_id !== null ? getHeadToHead(row.player1_id, row.player2_id) : Promise.resolve(null),
  ]);
  const books = (odds.data ?? []).map((o) => ({ vendor: o.vendor, p1: o.player1_odds, p2: o.player2_odds }));
  // Replay the price changes: after each one, the consensus of every book's latest price.
  const latest = new Map<string, { vendor: string; p1: number | null; p2: number | null }>();
  const marketHistory: { at: string; p: number }[] = [];
  for (const h of oddsHistory.data ?? []) {
    latest.set(h.vendor, { vendor: h.vendor, p1: h.player1_odds, p2: h.player2_odds });
    const fair = summarizeMarket([...latest.values()]).fair1;
    if (fair === null) continue;
    if (marketHistory.at(-1)?.at === h.taken_at) marketHistory[marketHistory.length - 1].p = fair;
    else marketHistory.push({ at: h.taken_at, p: fair });
  }

  const side = (k: string, s: NonNullable<Result["player1"]>, id: number | null, r: RatingRow | undefined, form: PreviewSide["form"], title: PreviewSide["title"]): PreviewSide => ({
    key: k,
    id,
    name: s.name,
    countryCode: s.countryCode,
    rank: id !== null ? (rankOf.get(id) ?? null) : null,
    rating: r ? Math.round(r.elo) : null,
    form,
    title,
  });

  return {
    match,
    tour,
    surface,
    category: row.tournaments.category,
    scheduled,
    a: side(keyA, match.player1, row.player1_id, ra, formA, titleA),
    b: side(keyB, match.player2, row.player2_id, rb, formB, titleB),
    chanceA: scheduled ? (haveRatings ? p(surface) : null) : row.pre_match_p1,
    bySurface: haveRatings ? (["Hard", "Clay", "Grass"] as const).map((s) => ({ surface: s, p: p(s) })) : [],
    h2h,
    market: books.length ? summarizeMarket(books) : null,
    marketHistory,
    recap: recap.data ?? null,
  };
});

/** Scheduled matches for the sitemap. */
export async function getScheduledMatchIds(limit = 500): Promise<number[]> {
  const { data } = await createPublicClient().from("matches").select("id").eq("status", "scheduled").eq("confirmed", true).limit(limit);
  return (data ?? []).map((m) => m.id);
}
