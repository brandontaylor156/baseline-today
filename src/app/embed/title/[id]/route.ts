import { getTitleOdds } from "@/lib/data/title-odds";
import { displayName, getTournament } from "@/lib/data/tournaments";
import { embedPage, esc, siteLink } from "@/lib/embed";

// Embeddable title chances for a tournament in progress: <iframe src="/embed/title/123">.
export async function GET(_request: Request, { params }: RouteContext<"/embed/title/[id]">) {
  const { id } = await params;
  const t = /^\d+$/.test(id) ? await getTournament(Number(id)) : null;
  if (!t) return new Response("Not found", { status: 404 });
  const name = displayName(t.name);
  const odds = t.champion ? null : await getTitleOdds(t.id);
  const body = odds
    ? `<ol>${odds.players
        .slice(0, 8)
        .map((p) => {
          const pct = Math.round(p.title * 100);
          const label = p.id !== null ? `<a class="name" href="${esc(siteLink(`/players/${p.id}`))}" target="_blank" rel="noopener">${esc(p.name)}</a>` : `<span class="name">${esc(p.name)}</span>`;
          return `<li>${label}<span class="bar"><i style="width:${Math.max(2, pct)}%"></i></span><span class="v">${pct < 1 ? "&lt;1" : pct}%</span></li>`;
        })
        .join("")}</ol>`
    : t.champion
      ? `<p>Champion: <strong>${esc(t.champion.name)}</strong></p>`
      : `<p>Title chances appear once the draw is out.</p>`;
  return embedPage(`${name}: title chances`, `<h1>${esc(name)} · title chances</h1>${body}`, siteLink(`/tournaments/${t.id}`));
}
