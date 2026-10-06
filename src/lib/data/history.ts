import "server-only";

import { cache } from "react";

import { slugify } from "@/lib/slug";
import { createPublicClient } from "@/lib/supabase/public";

import { displayName } from "./tournaments";

export interface EventSummary {
  tour: "atp" | "wta";
  providerId: number;
  name: string;
  category: string | null;
  surface: string | null;
  seasons: number;
  latestId: number;
  latestSeason: number;
  slug: string;
}

/** /history/atp-china-open-317: tour, readable name, and the provider's stable event id. */
export const eventSlug = (tour: string, name: string, providerId: number) => `${tour}-${slugify(displayName(name))}-${providerId}`;

export function parseEventSlug(slug: string): { tour: "atp" | "wta"; providerId: number } | null {
  const m = /^(atp|wta)-[a-z0-9-]*?-?(\d{1,9})$/.exec(slug);
  return m ? { tour: m[1] as "atp" | "wta", providerId: Number(m[2]) } : null;
}

const CATEGORY_ORDER = ["Grand Slam", "1000", "500", "250", "125"];
export const categoryWeight = (c: string | null) => {
  const i = CATEGORY_ORDER.findIndex((x) => c?.toLowerCase().includes(x.toLowerCase()));
  return i === -1 ? CATEGORY_ORDER.length : i;
};

/** Every event since 2015 (one per tour + provider id), named as in its latest season. */
export const getEvents = cache(async (): Promise<EventSummary[]> => {
  const { data, error } = await createPublicClient().rpc("event_list");
  if (error) throw new Error(`events: ${error.message}`);
  return (data ?? []).map((e) => ({
    tour: e.tour as "atp" | "wta",
    providerId: e.provider_id,
    name: displayName(e.name),
    category: e.category,
    surface: e.surface,
    seasons: e.seasons,
    latestId: e.latest_id,
    latestSeason: e.latest_season,
    slug: eventSlug(e.tour, e.name, e.provider_id),
  }));
});

export interface EditionRow {
  tournamentId: number;
  season: number;
  name: string;
  category: string | null;
  surface: string | null;
  endDate: string | null;
  matchId: number | null;
  winner: { id: number | null; name: string } | null;
  loser: { id: number | null; name: string } | null;
  score: string;
  winnerChance: number | null;
}

export interface EventHistory {
  editions: EditionRow[];
  upsets: { matchId: number; season: number; round: string | null; winner: { id: number | null; name: string }; loser: { id: number | null; name: string }; chance: number }[];
  /** Players with the most titles here, most first. */
  champions: { id: number | null; name: string; titles: number; seasons: number[] }[];
}

export const getEventHistory = cache(async (tour: string, providerId: number): Promise<EventHistory | null> => {
  const db = createPublicClient();
  const [{ data, error }, { data: ups }] = await Promise.all([
    db.rpc("event_history", { p_tour: tour, p_provider_id: providerId }),
    db.rpc("event_upsets", { p_tour: tour, p_provider_id: providerId, p_limit: 8 }),
  ]);
  if (error) throw new Error(`event history: ${error.message}`);
  if (!data?.length) return null;
  const editions: EditionRow[] = data.map((r) => {
    const sets = (Array.isArray(r.set_scores) ? r.set_scores : []) as { p1: number | null; p2: number | null }[];
    return {
      tournamentId: r.tournament_id,
      season: r.season,
      name: displayName(r.name),
      category: r.category,
      surface: r.surface,
      endDate: r.end_date,
      matchId: r.match_id,
      winner: r.winner ? { id: r.winner_id, name: r.winner } : null,
      loser: r.loser ? { id: r.loser_id, name: r.loser } : null,
      score: sets
        .filter((s) => s.p1 !== null && s.p2 !== null)
        .map((s) => (r.winner_side === 1 ? `${s.p1}-${s.p2}` : `${s.p2}-${s.p1}`))
        .join(" "),
      winnerChance: r.winner_chance,
    };
  });
  const byChamp = new Map<string, { id: number | null; name: string; titles: number; seasons: number[] }>();
  for (const e of editions) {
    if (!e.winner) continue;
    const key = e.winner.id !== null ? `id:${e.winner.id}` : e.winner.name;
    const c = byChamp.get(key) ?? { ...e.winner, titles: 0, seasons: [] };
    c.titles++;
    c.seasons.push(e.season);
    byChamp.set(key, c);
  }
  return {
    editions,
    upsets: (ups ?? []).map((u) => ({
      matchId: u.match_id,
      season: u.season,
      round: u.round,
      winner: { id: u.winner_id, name: u.winner ?? "?" },
      loser: { id: u.loser_id, name: u.loser ?? "?" },
      chance: u.winner_chance,
    })),
    champions: [...byChamp.values()].sort((a, b) => b.titles - a.titles || Math.max(...b.seasons) - Math.max(...a.seasons)),
  };
});
