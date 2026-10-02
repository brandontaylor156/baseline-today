import "server-only";

import {
  mapLatestRankings,
  mapMatch,
  mapPlayer,
  mapTournament,
  type BdlMatch,
  type BdlPage,
  type BdlPlayer,
  type BdlRanking,
  type BdlTournament,
} from "./balldontlie-map";
import type { ProviderMatch, ProviderPlayer, ProviderRanking, ProviderTournament, TennisProvider, Tour } from "./types";

const BASE_URL = "https://api.balldontlie.io";
const MAX_PER_PAGE = 100;
const MAX_ATTEMPTS = 3;
/** Safety stop for cursor pagination (100 per page). */
const MAX_PAGES = 10;

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

function apiKey(): string {
  const key = process.env.BALLDONTLIE_API_KEY;
  if (!key) throw new ProviderError("BALLDONTLIE_API_KEY is not set");
  return key;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request<T>(tour: Tour, path: string, params: URLSearchParams): Promise<BdlPage<T>> {
  const url = `${BASE_URL}/${tour}/v1/${path}?${params}`;

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: apiKey() }, cache: "no-store" });

    if (res.ok) return (await res.json()) as BdlPage<T>;

    // Free tier allows 5 requests/minute; wait out a 429 rather than failing the whole job.
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 15) * 1000);
      continue;
    }

    throw new ProviderError(`BALLDONTLIE ${tour} ${path} failed: HTTP ${res.status}`, res.status);
  }
}

/** Follows next_cursor until the last page. */
async function requestAll<T>(tour: Tour, path: string, params: URLSearchParams): Promise<T[]> {
  const rows: T[] = [];
  let cursor: number | null | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const p = new URLSearchParams(params);
    p.set("per_page", String(MAX_PER_PAGE));
    if (cursor) p.set("cursor", String(cursor));
    const res = await request<T>(tour, path, p);
    rows.push(...res.data);
    cursor = res.meta.next_cursor;
    if (!cursor) break;
  }
  return rows;
}

export const balldontlie: TennisProvider = {
  name: "balldontlie",

  async getRankings(tour: Tour, limit: number, date?: string): Promise<ProviderRanking[]> {
    const params = new URLSearchParams({ per_page: String(Math.min(limit, MAX_PER_PAGE)) });
    if (date) params.set("date", date);
    const page = await request<BdlRanking>(tour, "rankings", params);
    return mapLatestRankings(tour, page.data, limit);
  },

  async getPlayers(tour: Tour, providerIds: number[]): Promise<ProviderPlayer[]> {
    const players: ProviderPlayer[] = [];
    for (let i = 0; i < providerIds.length; i += MAX_PER_PAGE) {
      const params = new URLSearchParams({ per_page: String(MAX_PER_PAGE) });
      for (const id of providerIds.slice(i, i + MAX_PER_PAGE)) params.append("player_ids[]", String(id));
      const page = await request<BdlPlayer>(tour, "players", params);
      players.push(...page.data.map((p) => mapPlayer(tour, p)));
    }
    return players;
  },

  async getTournaments(tour: Tour, season: number): Promise<ProviderTournament[]> {
    const rows = await requestAll<BdlTournament>(tour, "tournaments", new URLSearchParams({ season: String(season) }));
    return rows.map((t) => mapTournament(tour, t));
  },

  async getMatches(tour: Tour, tournamentProviderIds: number[]): Promise<ProviderMatch[]> {
    if (tournamentProviderIds.length === 0) return [];
    const params = new URLSearchParams();
    for (const id of tournamentProviderIds) params.append("tournament_ids[]", String(id));
    const rows = await requestAll<BdlMatch>(tour, "matches", params);
    return rows.map((m) => mapMatch(tour, m));
  },

  async getLiveMatches(tour: Tour): Promise<ProviderMatch[]> {
    const rows = await requestAll<BdlMatch>(tour, "matches", new URLSearchParams({ is_live: "true" }));
    return rows.map((m) => mapMatch(tour, m));
  },
};
