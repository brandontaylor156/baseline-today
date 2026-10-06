import { getPlayerLines } from "@/lib/data/explorer";
import { getPlayer } from "@/lib/data/tennis";
import { applyFilters, parseFilters } from "@/lib/lab/explorer";
import { LICENSE_NAME, toCsv } from "@/lib/open-data";

// The explorer's current query as CSV (same query string as the page).
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const pid = params.p && /^\d{1,9}$/.test(params.p) ? Number(params.p) : null;
  const player = pid ? await getPlayer(pid) : null;
  if (!player) return new Response("Pick a player (p=<id>)", { status: 404 });
  const lines = applyFilters(await getPlayerLines(player.id), parseFilters(params));
  const csv = toCsv(
    ["match_id", "season", "date", "tournament", "category", "surface", "round", "player", "opponent", "opponent_country", "result", "score", "retired", "model_chance", "license"],
    lines.map((l) => [
      l.matchId,
      l.season,
      l.date,
      l.tournament,
      l.category,
      l.surface,
      l.round,
      player.fullName,
      l.opponent.name,
      l.opponent.country,
      l.won ? "W" : "L",
      l.sets.map(([a, b]) => `${a}-${b}`).join(" "),
      l.retired ? 1 : 0,
      l.chance === null ? null : Math.round(l.chance * 1000) / 1000,
      `Results: Wikipedia contributors, ${LICENSE_NAME}`,
    ]),
  );
  const name = `${player.fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-matches.csv`;
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "public, s-maxage=3600" },
  });
}
