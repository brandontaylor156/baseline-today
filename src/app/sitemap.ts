import type { MetadataRoute } from "next";

import { getCountries } from "@/lib/data/countries";
import { getRankingDates, getRankings } from "@/lib/data/tennis";
import { getSeasonTournaments } from "@/lib/data/tournaments";
import { TOURS } from "@/lib/provider/types";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

// Section pages, this week's ranked players, this season's tournaments and every country page.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const season = new Date().getUTCFullYear();
  const [rankings, tournaments, countries] = await Promise.all([
    Promise.all(
      TOURS.map(async (t) => {
        const [latest] = await getRankingDates(t);
        return latest ? getRankings(t, latest) : [];
      }),
    ),
    getSeasonTournaments(season),
    getCountries(),
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
    ...rankings.flat().map((r) => page(`/players/${r.player.id}`, "weekly", 0.6)),
    ...tournaments.map((t) => page(`/tournaments/${t.id}`, "weekly", 0.5)),
    ...countries.map((c) => page(`/countries/${c.code}`, "weekly", 0.4)),
  ];
}
