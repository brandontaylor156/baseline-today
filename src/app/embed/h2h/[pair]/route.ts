import { getHeadToHead } from "@/lib/data/h2h";
import { predictPair } from "@/lib/data/predictions";
import { getPlayer } from "@/lib/data/tennis";
import { embedPage, esc, siteLink } from "@/lib/embed";
import { h2hPath, parseH2H } from "@/lib/slug";

// Embeddable head-to-head card: record, by surface and today's model chance.
// <iframe src="/embed/h2h/<a>-vs-<b>-<id>-<id>"> (the same slug as the head-to-head page).
export async function GET(_request: Request, { params }: RouteContext<"/embed/h2h/[pair]">) {
  const ids = parseH2H((await params).pair);
  if (!ids) return new Response("Not found", { status: 404 });
  const [a, b] = await Promise.all([getPlayer(ids.a), getPlayer(ids.b)]);
  if (!a || !b || a.tour !== b.tour) return new Response("Not found", { status: 404 });
  const [h2h, model] = await Promise.all([getHeadToHead(a.id, b.id), predictPair(a.tour, a.id, b.id, null)]);
  const rows = [
    `<li><span class="name">Head-to-head</span><span class="v">${h2h.winsA}–${h2h.winsB}</span></li>`,
    ...h2h.bySurface.map((s) => `<li><span class="name">${esc(s.surface)}</span><span class="v">${s.a}–${s.b}</span></li>`),
    ...(model
      ? [`<li><span class="name">If they played today</span><span class="v">${Math.round(model.p * 100)}% – ${Math.round((1 - model.p) * 100)}%</span></li>`]
      : []),
  ].join("");
  const title = `${a.fullName} vs ${b.fullName}`;
  return embedPage(title, `<h1>${esc(title)}</h1><ol>${rows}</ol>`, siteLink(h2hPath({ id: a.id, name: a.fullName }, { id: b.id, name: b.fullName })));
}
