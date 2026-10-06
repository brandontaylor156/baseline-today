import { getRecentResults } from "@/lib/data/results";
import { displayName } from "@/lib/data/tournaments";
import { getRecapWeeks } from "@/lib/data/weekly";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { weekLabel, weekRange } from "@/lib/weeks";

export const revalidate = 1800;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Item = { title: string; link: string; date: string; description: string };

// RSS 2.0: the latest results (from Wikipedia draw pages) and the weekly recaps.
export async function GET() {
  const now = new Date();
  const [{ groups }, weeks] = await Promise.all([getRecentResults(now, { cached: true }), getRecapWeeks(now.getUTCFullYear())]);

  const results: Item[] = groups.flatMap((g) =>
    g.results
      .filter((r) => r.player1 && r.player2 && r.winner && r.reportedAt)
      .map((r) => {
        const [w, l] = r.winner === 1 ? [r.player1!, r.player2!] : [r.player2!, r.player1!];
        const sets = r.sets
          .filter((s) => s.p1 !== null && s.p2 !== null)
          .map((s) => (r.winner === 1 ? `${s.p1}-${s.p2}` : `${s.p2}-${s.p1}`))
          .join(" ");
        const where = `${displayName(g.name)}${r.round ? `, ${r.round}` : ""}`;
        return {
          title: `${w.name} d. ${l.name} ${sets}`.trim(),
          link: `${SITE_URL}/matches/${r.id}`,
          date: r.reportedAt!,
          description: `${where}. Results from Wikipedia (CC BY-SA 4.0).`,
        };
      }),
  );
  const recaps: Item[] = weeks.slice(0, 8).map((w) => ({
    title: `Week in tennis: ${weekLabel(w)}`,
    link: `${SITE_URL}/week/${w}`,
    date: `${weekRange(w).end}T23:00:00Z`,
    description: "Champions, the biggest upsets, ranking movers and our model's record.",
  }));
  const items = [...results, ...recaps].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(SITE_NAME)}: tennis results and weekly recaps</title>
<link>${SITE_URL}</link>
<description>Finished ATP and WTA singles matches and a weekly recap of champions, upsets and ranking movers.</description>
<language>en</language>
<atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
${items
  .map(
    (i) => `<item>
<title>${esc(i.title)}</title>
<link>${esc(i.link)}</link>
<guid isPermaLink="true">${esc(i.link)}</guid>
<pubDate>${new Date(i.date).toUTCString()}</pubDate>
<description>${esc(i.description)}</description>
</item>`,
  )
  .join("\n")}
</channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
