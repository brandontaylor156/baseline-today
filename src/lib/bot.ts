import "server-only";

import { getHeadToHead } from "@/lib/data/h2h";
import { predictPair } from "@/lib/data/predictions";
import { getRecentResults } from "@/lib/data/results";
import { getRankingDates, getRankings, searchPlayers } from "@/lib/data/tennis";
import { displayName } from "@/lib/data/tournaments";
import { getTrackRecord } from "@/lib/data/track-record";
import { formatPoints, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { SITE_URL } from "@/lib/site";

// Plain-text answers for chat bots and digests (Discord and Slack both render this markdown-ish
// text). Kept under Discord's 2,000-character limit.
const LIMIT = 1900;
const clip = (s: string) => (s.length > LIMIT ? `${s.slice(0, LIMIT - 1)}…` : s);
const pct = (p: number) => `${Math.round(p * 100)}%`;

export async function oddsText(first: string, second: string): Promise<string> {
  const [[a], [b]] = await Promise.all([searchPlayers(first, 1), searchPlayers(second, 1)]);
  if (!a || !b) return `Couldn't find ${!a ? `“${first}”` : `“${second}”`}. Try a surname, like "sinner".`;
  if (a.tour !== b.tour) return `${a.fullName} and ${b.fullName} play on different tours.`;
  if (a.id === b.id) return "Pick two different players.";
  const [model, h2h] = await Promise.all([predictPair(a.tour, a.id, b.id, null), getHeadToHead(a.id, b.id)]);
  const chance = model ? `${a.fullName} ${pct(model.p)} · ${b.fullName} ${pct(1 - model.p)} (our model, all courts)` : "Not enough history for a model estimate.";
  return clip(
    [
      `**${a.fullName} vs ${b.fullName}**`,
      chance,
      `Head-to-head since 2015: ${h2h.winsA}–${h2h.winsB}`,
      `${SITE_URL}/h2h?a=${a.id}&b=${b.id}`,
      "_Estimates, not betting advice._",
    ].join("\n"),
  );
}

export async function rankingsText(tour: Tour): Promise<string> {
  const [latest] = await getRankingDates(tour);
  const rows = latest ? (await getRankings(tour, latest)).slice(0, 10) : [];
  if (rows.length === 0) return "No rankings stored yet.";
  return clip([`**${TOUR_LABEL[tour]} top 10**`, ...rows.map((r) => `${r.rank}. ${r.player.fullName} · ${formatPoints(r.points)}`), `${SITE_URL}/rankings/${tour}`].join("\n"));
}

export async function resultsText(max = 12): Promise<string> {
  const recent = await getRecentResults(new Date(), { cached: true });
  const lines: string[] = [];
  for (const g of recent.groups) {
    if (lines.length >= max) break;
    lines.push(`**${displayName(g.name)}**`);
    for (const r of g.results.slice(0, 4)) {
      const w = r.winner === 1 ? r.player1 : r.player2;
      const l = r.winner === 1 ? r.player2 : r.player1;
      const score = r.sets
        .filter((s) => s.p1 !== null && s.p2 !== null)
        .map((s) => (r.winner === 1 ? `${s.p1}-${s.p2}` : `${s.p2}-${s.p1}`))
        .join(" ");
      lines.push(`${w?.name ?? "?"} d. ${l?.name ?? "?"} ${score}${r.round ? ` (${r.round})` : ""}`);
    }
  }
  if (lines.length === 0) return "No results in the last few days.";
  return clip([...lines, `${SITE_URL}/results`, "Results from Wikipedia (CC BY-SA 4.0)."].join("\n"));
}

/** The daily digest: latest results and the model's week. */
export async function digestText(): Promise<string> {
  const [results, record] = await Promise.all([resultsText(10), getTrackRecord()]);
  const model = record.total ? `\nOur model this week: ${record.correct}–${record.total - record.correct} (${pct(record.correct / record.total)})` : "";
  return clip(`🎾 **Baseline Today daily**\n${results}${model}`);
}
