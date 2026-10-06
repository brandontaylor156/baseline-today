import "server-only";

import type { MatchStatus, SetScore, Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import { normalizeName } from "@/lib/wiki/names";
import { roundRank } from "@/lib/wiki/rows";

import type { ScoreMatch } from "./scores-group";

const DAY = 24 * 60 * 60 * 1000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const RESULT_SELECT = `id, provider, tour, round, status, result_detail, set_scores, winner_side, winner_id,
  player1_name, player2_name, player1_country, player2_country, source_url, score_changed_at, season,
  tournaments!inner(id, name, category, start_date, end_date),
  p1:players!matches_player1_id_fkey(id, full_name, country_code),
  p2:players!matches_player2_id_fkey(id, full_name, country_code)`;

export type ResultRow = {
  id: number;
  provider: string;
  tour: string;
  round: string | null;
  status: string;
  result_detail: string | null;
  set_scores: unknown;
  winner_side: number | null;
  winner_id: number | null;
  player1_name: string | null;
  player2_name: string | null;
  player1_country: string | null;
  player2_country: string | null;
  source_url: string | null;
  score_changed_at: string | null;
  season: number | null;
  tournaments: { id: number; name: string; category: string | null; start_date: string | null; end_date: string | null };
  p1: { id: number; full_name: string; country_code: string | null } | null;
  p2: { id: number; full_name: string; country_code: string | null } | null;
};

export interface Result extends ScoreMatch {
  provider: string;
  sourceUrl: string | null;
  reportedAt: string | null;
  tournamentStart: string | null;
  tournamentEnd: string | null;
}

export function toResult(r: ResultRow): Result {
  const side = (p: ResultRow["p1"], name: string | null, country: string | null) =>
    p ? { id: p.id, name: p.full_name, countryCode: p.country_code ?? country } : name ? { id: null, name, countryCode: country } : null;
  const winner =
    r.winner_side === 1 || r.winner_side === 2
      ? (r.winner_side as 1 | 2)
      : r.winner_id !== null
        ? r.winner_id === r.p1?.id
          ? 1
          : r.winner_id === r.p2?.id
            ? 2
            : null
        : null;
  return {
    id: r.id,
    provider: r.provider,
    tour: r.tour as Tour,
    tournament: { id: r.tournaments.id, name: r.tournaments.name, category: r.tournaments.category },
    round: r.round,
    status: r.status as MatchStatus,
    resultDetail: r.result_detail,
    isLive: false,
    sets: (Array.isArray(r.set_scores) ? r.set_scores : []) as SetScore[],
    p1Game: null,
    p2Game: null,
    server: null,
    scheduledAt: null,
    notBefore: null,
    player1: side(r.p1, r.player1_name, r.player1_country),
    player2: side(r.p2, r.player2_name, r.player2_country),
    winner,
    sourceUrl: r.source_url,
    reportedAt: r.score_changed_at,
    tournamentStart: r.tournaments.start_date,
    tournamentEnd: r.tournaments.end_date,
  };
}

/** When both sources have the same match, keep the provider's (it has times and ids). */
export function dedupeResults(results: Result[]): Result[] {
  const key = (r: Result) =>
    `${r.tournament.id}|${[r.player1?.name, r.player2?.name].map((n) => normalizeName(n ?? "")).sort().join("|")}`;
  const providerKeys = new Set(results.filter((r) => r.provider !== "wikipedia").map(key));
  return results.filter((r) => r.provider !== "wikipedia" || !providerKeys.has(key(r)));
}

/** Latest rounds first, then most recently reported. */
export function sortResults(results: Result[]): Result[] {
  return [...results].sort(
    (a, b) => roundRank(b.round) - roundRank(a.round) || (b.reportedAt ?? "").localeCompare(a.reportedAt ?? ""),
  );
}

export interface ResultsGroup {
  id: number;
  name: string;
  category: string | null;
  tour: Tour;
  endDate: string | null;
  sources: { title: string; url: string }[];
  results: Result[];
}

export function titleFromUrl(url: string): string {
  const title = decodeURIComponent(url.split("/wiki/")[1] ?? url).replace(/_/g, " ");
  // Credit non-English pages with their edition of Wikipedia.
  return url.startsWith("https://it.wikipedia.org/") ? `${title} (Italian Wikipedia)` : title;
}

/** Tournaments still in play first, then the most recently finished; ties by latest result. */
export function sortGroups(groups: ResultsGroup[], today: string): ResultsGroup[] {
  const live = (g: ResultsGroup) => (g.endDate !== null && g.endDate >= today ? 1 : 0);
  return [...groups].sort(
    (a, b) =>
      live(b) - live(a) ||
      (b.endDate ?? "").localeCompare(a.endDate ?? "") ||
      (b.results[0]?.reportedAt ?? "").localeCompare(a.results[0]?.reportedAt ?? ""),
  );
}

/** Confirmed results of tournaments in play or finished in the last three days. */
export async function getRecentResults(
  now = new Date(),
  { cached = false }: { cached?: boolean } = {},
): Promise<{ groups: ResultsGroup[]; refreshedAt: string | null }> {
  // The Results page reads fresh; cached pages (the homepage) pass cached: true.
  const db = createPublicClient({ cached });
  // Tournaments first, then their matches: filtering matches through the embedded tournament
  // checks every stored result (52,000+) and can hit the statement timeout.
  const { data: inWindow, error: tErr } = await db
    .from("tournaments")
    .select("id")
    .gte("end_date", isoDate(new Date(now.getTime() - 3 * DAY)))
    .lte("start_date", isoDate(new Date(now.getTime() + DAY)))
    .limit(200);
  if (tErr) throw new Error(`results: ${tErr.message}`);
  const [{ data, error }, state] = await Promise.all([
    db
      .from("matches")
      .select(RESULT_SELECT)
      .eq("status", "final")
      .eq("confirmed", true)
      .in("tournament_id", (inWindow ?? []).map((t) => t.id).concat(-1))
      .limit(1000),
    db.from("sync_state").select("last_refreshed_at").eq("key", "results").maybeSingle(),
  ]);
  if (error) throw new Error(`results: ${error.message}`);

  const results = dedupeResults((data as unknown as ResultRow[]).map(toResult));
  const groups = new Map<number, ResultsGroup>();
  for (const r of results) {
    const g = groups.get(r.tournament.id) ?? { ...r.tournament, tour: r.tour, endDate: r.tournamentEnd, sources: [], results: [] };
    g.results.push(r);
    if (r.provider === "wikipedia" && r.sourceUrl && !g.sources.some((s) => s.url === r.sourceUrl)) {
      g.sources.push({ title: titleFromUrl(r.sourceUrl), url: r.sourceUrl });
    }
    groups.set(r.tournament.id, g);
  }
  const ordered = sortGroups(
    [...groups.values()].map((g) => ({ ...g, results: sortResults(g.results) })),
    isoDate(now),
  );
  return { groups: ordered, refreshedAt: state.data?.last_refreshed_at ?? null };
}

export interface PlayerResults {
  recent: Result[];
  season: number;
  wins: number;
  losses: number;
  sources: { title: string; url: string }[];
}

/** A player's latest confirmed results and season record (walkovers don't count). */
export async function getPlayerResults(playerId: number, now = new Date()): Promise<PlayerResults> {
  const db = createPublicClient();
  const season = now.getUTCFullYear();
  const { data, error } = await db
    .from("matches")
    .select(RESULT_SELECT)
    .eq("status", "final")
    .eq("confirmed", true)
    .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
    .gte("season", season - 1)
    .limit(500);
  if (error) throw new Error(`player results: ${error.message}`);

  const all = dedupeResults((data as unknown as ResultRow[]).map(toResult)).sort(
    (a, b) => (b.tournamentStart ?? "").localeCompare(a.tournamentStart ?? "") || roundRank(b.round) - roundRank(a.round),
  );
  const side = (r: Result) => (r.player1?.id === playerId ? 1 : 2);
  const thisSeason = (data as unknown as ResultRow[]).filter((r) => r.season === season).map((r) => r.id);
  const counted = all.filter((r) => thisSeason.includes(r.id) && r.resultDetail !== "walkover" && r.winner !== null);
  const recent = all.slice(0, 10);
  const sources: { title: string; url: string }[] = [];
  for (const r of recent) {
    if (r.provider === "wikipedia" && r.sourceUrl && !sources.some((s) => s.url === r.sourceUrl)) {
      sources.push({ title: titleFromUrl(r.sourceUrl), url: r.sourceUrl });
    }
  }
  return {
    recent,
    season,
    wins: counted.filter((r) => r.winner === side(r)).length,
    losses: counted.filter((r) => r.winner !== side(r)).length,
    sources,
  };
}
