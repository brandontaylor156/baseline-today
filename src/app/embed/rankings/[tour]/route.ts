import { getRankingDates, getRankings } from "@/lib/data/tennis";
import { embedPage, esc, siteLink } from "@/lib/embed";
import { formatPoints, isTour, TOUR_LABEL } from "@/lib/format";

// Embeddable top 10 of a tour: <iframe src="/embed/rankings/atp">.
export async function GET(_request: Request, { params }: RouteContext<"/embed/rankings/[tour]">) {
  const { tour } = await params;
  if (!isTour(tour)) return new Response("Not found", { status: 404 });
  const [latest] = await getRankingDates(tour);
  const rows = latest ? (await getRankings(tour, latest)).slice(0, 10) : [];
  const items = rows
    .map(
      (r) =>
        `<li><span class="n">${r.rank}</span><a class="name" href="${esc(siteLink(`/players/${r.player.id}`))}" target="_blank" rel="noopener">${esc(r.player.fullName)}</a><span class="v">${esc(formatPoints(r.points))}</span></li>`,
    )
    .join("");
  return embedPage(`${TOUR_LABEL[tour]} top 10`, `<h1>${TOUR_LABEL[tour]} top 10</h1><ol>${items}</ol>`, siteLink(`/rankings/${tour}`));
}
