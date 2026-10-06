import { getPlayerStats } from "@/lib/data/stats";
import { getPlayer } from "@/lib/data/tennis";
import { embedPage, esc, siteLink } from "@/lib/embed";
import { formatPoints, TOUR_LABEL } from "@/lib/format";

// Embeddable player card: rank, points and this season's record. <iframe src="/embed/player/<id>">.
export async function GET(_request: Request, { params }: RouteContext<"/embed/player/[id]">) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) return new Response("Not found", { status: 404 });
  const player = await getPlayer(Number(id));
  if (!player) return new Response("Not found", { status: 404 });
  const season = new Date().getUTCFullYear();
  const stats = await getPlayerStats(player.id, season);
  const latest = player.history.at(-1);
  const w = stats.season.overall.w;
  const l = stats.season.overall.l;
  const rows = [
    ["Rank", latest ? `#${latest.rank}` : "–"],
    ["Points", latest ? formatPoints(latest.points) : "–"],
    [`${season} record`, `${w}–${l}`],
    ["Titles", String(stats.season.titles)],
  ]
    .map(([k, v]) => `<li><span class="name">${esc(k)}</span><span class="v">${esc(v)}</span></li>`)
    .join("");
  return embedPage(player.fullName, `<h1>${esc(player.fullName)} · ${TOUR_LABEL[player.tour]}</h1><ol>${rows}</ol>`, siteLink(`/players/${player.id}`));
}
