import type { MetadataRoute } from "next";

import { getCountries } from "@/lib/data/countries";
import { getScheduledMatchIds } from "@/lib/data/match-preview";
import { getRankingDates, getRankings } from "@/lib/data/tennis";
import { getSeasonTournaments } from "@/lib/data/tournaments";
import { getEvents } from "@/lib/data/history";
import { getRecapWeeks } from "@/lib/data/weekly";
import { TOURS } from "@/lib/provider/types";
import { SITE_URL } from "@/lib/site";
import { h2hPath } from "@/lib/slug";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 86400;

// Section pages, this week's ranked players, this season's tournaments, every country page,
// upcoming matches and the head-to-heads of top-100 rivals with 3+ meetings.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const season = new Date().getUTCFullYear();
  const [rankings, tournaments, countries, upcoming, rivalries, weeks, events] = await Promise.all([
    Promise.all(
      TOURS.map(async (t) => {
        const [latest] = await getRankingDates(t);
        return latest ? getRankings(t, latest) : [];
      }),
    ),
    getSeasonTournaments(season),
    getCountries(),
    getScheduledMatchIds(),
    // PostgREST returns at most 1,000 rows per request: fetch the rivalries in pages.
    Promise.all([0, 1000].map((from) => createPublicClient().rpc("top_rivalries", { p_min: 3, p_limit: 2000 }).range(from, from + 999))),
    getRecapWeeks(season),
    getEvents(),
  ]);

  const page = (path: string, changeFrequency: "daily" | "weekly", priority: number) => ({ url: `${SITE_URL}${path}`, changeFrequency, priority });
  return [
    page("/", "daily", 1),
    page("/results", "daily", 0.9),
    page("/rankings/atp", "weekly", 0.9),
    page("/rankings/wta", "weekly", 0.9),
    page("/tournaments", "daily", 0.8),
    page("/odds", "daily", 0.7),
    page("/stats", "daily", 0.7),
    page("/ratings", "weekly", 0.6),
    page("/race", "daily", 0.6),
    page("/pickem", "daily", 0.5),
    page("/countries", "weekly", 0.5),
    page("/h2h", "weekly", 0.4),
    page("/week", "weekly", 0.6),
    page("/data", "weekly", 0.5),
    page("/upsets", "weekly", 0.5),
    page("/model", "weekly", 0.5),
    page("/changelog", "weekly", 0.3),
    page("/records", "weekly", 0.6),
    page("/lab", "weekly", 0.7),
    page("/lab/luck", "weekly", 0.6),
    page("/lab/luck?tour=wta", "weekly", 0.6),
    page("/lab/time-machine", "weekly", 0.6),
    page("/lab/aging", "weekly", 0.5),
    page("/lab/explorer", "weekly", 0.5),
    page("/lab/similar", "weekly", 0.5),
    page("/lab/in-the-way", "weekly", 0.6),
    page("/lab/clutch", "weekly", 0.6),
    page("/lab/dream-draw", "weekly", 0.5),
    page("/lab/forecast", "daily", 0.7),
    page("/lab/form", "daily", 0.6),
    page("/lab/form?tour=wta", "daily", 0.6),
    page("/lab/forecast?tour=wta", "daily", 0.7),
    page("/lab/clutch?tour=wta", "weekly", 0.6),
    page("/lab/in-the-way?tour=wta", "weekly", 0.6),
    ...rankings.flat().slice(0, 100).map((r) => page(`/lab/similar?p=${r.player.id}`, "weekly", 0.3)),
    page("/play", "daily", 0.6),
    page("/tools/betting", "weekly", 0.4),
    page("/records?tour=wta", "weekly", 0.6),
    page("/history", "weekly", 0.6),
    ...events.filter((e) => e.seasons >= 2).map((e) => page(`/history/${e.slug}`, "weekly", 0.5)),
    page("/about", "weekly", 0.4),
    ...weeks.map((w) => page(`/week/${w}`, "weekly", 0.5)),
    ...rankings.flat().map((r) => page(`/players/${r.player.id}`, "weekly", 0.6)),
    ...rankings.flat().map((r) => page(`/players/${r.player.id}/rivals`, "weekly", 0.4)),
    ...rankings.flat().flatMap((r) => [season, season - 1].map((y) => page(`/players/${r.player.id}/season/${y}`, "weekly", 0.4))),
    ...tournaments.map((t) => page(`/tournaments/${t.id}`, "weekly", 0.5)),
    ...countries.map((c) => page(`/countries/${c.code}`, "weekly", 0.4)),
    ...upcoming.map((id) => page(`/matches/${id}`, "daily", 0.5)),
    ...rivalries.flatMap((r) => r.data ?? []).map((r) => page(h2hPath({ id: r.player_a, name: r.name_a }, { id: r.player_b, name: r.name_b }), "weekly", 0.5)),
  ];
}
