import { getSeasonMatches } from "@/lib/data/season";
import { displayName } from "@/lib/data/tournaments";
import { embedPage, esc, siteLink } from "@/lib/embed";
import { upsets } from "@/lib/leaders";
import { TOURS } from "@/lib/provider/types";

// Embeddable biggest upsets of the last 7 days: <iframe src="/embed/upsets">.
export async function GET() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const matches = (await Promise.all(TOURS.map((t) => getSeasonMatches(t, now.getUTCFullYear())))).flat().filter((m) => m.date >= weekAgo);
  const items = upsets(matches, 0.35, 6)
    .map(({ match: m, winnerChance }) => {
      const [w, l] = m.winner === 1 ? [m.p1, m.p2] : [m.p2, m.p1];
      return `<li><span class="v">${Math.round(winnerChance * 100)}%</span><a class="name" href="${esc(siteLink(`/matches/${m.id}`))}" target="_blank" rel="noopener">${esc(w.name)} beat ${esc(l.name)}</a><span class="n" style="width:auto">${esc(displayName(m.tournamentName))}</span></li>`;
    })
    .join("");
  const body = items ? `<ol>${items}</ol>` : `<p>No big upsets in the last 7 days.</p>`;
  return embedPage("Upsets this week", `<h1>Upsets this week</h1>${body}`, siteLink("/upsets"));
}
