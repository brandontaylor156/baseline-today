import { getRatedPlayers } from "@/lib/data/ratings";
import { getSeasonMatches } from "@/lib/data/season";
import { displayName } from "@/lib/data/tournaments";
import { CREDIT, LICENSE_NAME, parseDataFile, RATING_COLUMNS, RATINGS_SOURCE, RESULT_COLUMNS, TITLE_CHANCE_COLUMNS, toCsv } from "@/lib/open-data";
import { createPublicClient } from "@/lib/supabase/public";
import { TOURS } from "@/lib/provider/types";

// Open data: /data/results-<season>.csv|json and /data/ratings.csv|json. Cached at the edge for a day.
export async function GET(_request: Request, { params }: RouteContext<"/data/[file]">) {
  const { file } = await params;
  const spec = parseDataFile(file, new Date().getUTCFullYear());
  if (!spec) return new Response("Not found", { status: 404 });

  let columns: string[];
  let rows: (string | number | null)[][];
  if (spec.kind === "results") {
    // Wikipedia results only: provider data isn't ours to redistribute.
    const matches = (await Promise.all(TOURS.map((t) => getSeasonMatches(t, spec.season)))).flat().filter((m) => m.provider === "wikipedia");
    columns = RESULT_COLUMNS;
    rows = matches.map((m) => {
      const [w, l] = m.winner === 1 ? [m.p1, m.p2] : [m.p2, m.p1];
      const score = m.sets
        .filter((s) => s.p1 !== null && s.p2 !== null)
        .map((s) => (m.winner === 1 ? `${s.p1}-${s.p2}` : `${s.p2}-${s.p1}`))
        .join(" ");
      const chance = m.preMatchP1 === null ? null : Math.round((m.winner === 1 ? m.preMatchP1 : 1 - m.preMatchP1) * 1000) / 1000;
      const source = m.sourceUrl ?? "https://www.wikipedia.org (Wikipedia draw page)";
      return [m.id, spec.season, m.tour, m.tournamentId, displayName(m.tournamentName), m.date, m.surface, m.round, w.name, w.country, l.name, l.country, score, m.walkover ? 1 : 0, m.retired ? 1 : 0, chance, source, LICENSE_NAME];
    });
  } else if (spec.kind === "title-chances") {
    // Paged: PostgREST returns at most 1,000 rows per request.
    type T = { player_id: number | null; player_key: string; chance: number; champion: boolean; rating: number | null; path_chance: number | null; tournaments: { id: number; name: string; tour: string; category: string | null; season: number }; players: { full_name: string } | null };
    const all: T[] = [];
    const db = createPublicClient();
    // The season's tournaments first, then their rows (an embedded filter would scan every row).
    const { data: events } = await db.from("tournaments").select("id").eq("season", spec.season).limit(1000);
    const ids = (events ?? []).map((e) => e.id).concat(-1);
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from("lab_title_chances")
        .select("player_id, player_key, chance, champion, rating, path_chance, tournaments!inner(id, name, tour, category, season), players(full_name)")
        .in("tournament_id", ids)
        .order("tournament_id")
        .order("player_key")
        .range(from, from + 999);
      all.push(...((data ?? []) as unknown as T[]));
      if (!data || data.length < 1000) break;
    }
    columns = TITLE_CHANCE_COLUMNS;
    rows = all.map((r) => [
      r.tournaments.id,
      displayName(r.tournaments.name),
      r.tournaments.tour,
      r.tournaments.category,
      r.tournaments.season,
      r.players?.full_name ?? r.player_key.replace(/^name:/, ""),
      r.player_id,
      r.rating,
      Math.round(r.chance * 1e5) / 1e5,
      r.champion ? 1 : 0,
      r.path_chance === null ? null : Math.round(r.path_chance * 1e5) / 1e5,
      RATINGS_SOURCE,
      LICENSE_NAME,
    ]);
  } else {
    const rated = (await Promise.all(TOURS.map(async (t) => (await getRatedPlayers(t)).map((p) => ({ tour: t, ...p }))))).flat();
    columns = RATING_COLUMNS;
    rows = rated.map((p) => [p.tour, p.name, p.countryCode, Math.round(p.elo), Math.round(p.surface.hard), Math.round(p.surface.clay), Math.round(p.surface.grass), p.matches, RATINGS_SOURCE, LICENSE_NAME]);
  }

  const headers = {
    "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    "Access-Control-Allow-Origin": "*",
    "X-License": CREDIT[spec.kind === "title-chances" ? "ratings" : spec.kind],
    Link: '<https://creativecommons.org/licenses/by-sa/4.0/>; rel="license"',
  };
  if (spec.format === "json") {
    const data = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
    return Response.json(
      { license: LICENSE_NAME, attribution: CREDIT[spec.kind === "title-chances" ? "ratings" : spec.kind], generated: new Date().toISOString(), count: data.length, data },
      { headers },
    );
  }
  return new Response(toCsv(columns, rows), {
    headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"` },
  });
}
