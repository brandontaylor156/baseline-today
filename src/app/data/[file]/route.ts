import { getRatedPlayers } from "@/lib/data/ratings";
import { getSeasonMatches } from "@/lib/data/season";
import { displayName } from "@/lib/data/tournaments";
import { parseDataFile, RATING_COLUMNS, RESULT_COLUMNS, toCsv } from "@/lib/open-data";
import { TOURS } from "@/lib/provider/types";

const LICENSE = {
  results: "Match results from Wikipedia draw pages (https://en.wikipedia.org), CC BY-SA 4.0. Compiled by Baseline Today (https://baseline-today.vercel.app/data), shared under CC BY-SA 4.0.",
  ratings: "Elo ratings computed by Baseline Today (https://baseline-today.vercel.app/data) from Wikipedia results, CC BY-SA 4.0.",
};

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
      return [m.id, spec.season, m.tour, m.tournamentId, displayName(m.tournamentName), m.date, m.surface, m.round, w.name, w.country, l.name, l.country, score, m.walkover ? 1 : 0, m.retired ? 1 : 0, chance];
    });
  } else {
    const rated = (await Promise.all(TOURS.map(async (t) => (await getRatedPlayers(t)).map((p) => ({ tour: t, ...p }))))).flat();
    columns = RATING_COLUMNS;
    rows = rated.map((p) => [p.tour, p.name, p.countryCode, Math.round(p.elo), Math.round(p.surface.hard), Math.round(p.surface.clay), Math.round(p.surface.grass), p.matches]);
  }

  const headers = {
    "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    "Access-Control-Allow-Origin": "*",
    "X-License": LICENSE[spec.kind],
  };
  if (spec.format === "json") {
    const data = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
    return Response.json({ license: LICENSE[spec.kind], generated: new Date().toISOString(), count: data.length, data }, { headers });
  }
  return new Response(toCsv(columns, rows), {
    headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `inline; filename="${file}"` },
  });
}
