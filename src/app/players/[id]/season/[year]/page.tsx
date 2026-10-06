import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Flag } from "@/components/flag";
import { PlayerStatsSection } from "@/components/player-stats";
import { PlayerTimeline } from "@/components/player-timeline";
import { getSeasonMatches } from "@/lib/data/season";
import { getPlayerStats } from "@/lib/data/stats";
import { getPlayer } from "@/lib/data/tennis";
import { displayName } from "@/lib/data/tournaments";
import { formatDate, TOUR_LABEL } from "@/lib/format";
import type { SeasonMatch } from "@/lib/leaders";
import { seasonTimeline } from "@/lib/timeline";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

const FIRST = 2015;

async function load(params: PageProps<"/players/[id]/season/[year]">["params"]) {
  const { id, year } = await params;
  if (!/^\d+$/.test(id) || !/^\d{4}$/.test(year)) return null;
  const season = Number(year);
  if (season < FIRST || season > new Date().getUTCFullYear()) return null;
  const player = await getPlayer(Number(id));
  if (!player) return null;
  const [all, stats] = await Promise.all([getSeasonMatches(player.tour, season), getPlayerStats(player.id, season)]);
  const matches = all.filter((m) => m.p1.id === player.id || m.p2.id === player.id);
  if (matches.length === 0) return null;
  return { player, season, matches, stats };
}

export async function generateMetadata({ params }: PageProps<"/players/[id]/season/[year]">): Promise<Metadata> {
  const data = await load(params);
  if (!data) return { title: "Season review" };
  const { player, season, stats } = data;
  const s = stats.season;
  return {
    title: `${player.fullName}'s ${season} season`,
    description: `${player.fullName} in ${season}: ${s.overall.w}–${s.overall.l}, ${s.titles} title${s.titles === 1 ? "" : "s"}. Every tournament, best wins, toughest losses and surface splits.`,
  };
}

function Opp({ m, side }: { m: SeasonMatch; side: 1 | 2 }) {
  const o = side === 1 ? m.p2 : m.p1;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Flag code={o.country} reserve />
      {o.id !== null ? (
        <Link href={`/players/${o.id}`} className="truncate hover:underline">
          {o.name}
        </Link>
      ) : (
        <span className="truncate">{o.name}</span>
      )}
    </span>
  );
}

function MatchList({ title, note, rows, playerId }: { title: string; note: string; rows: { m: SeasonMatch; chance: number }[]; playerId: number }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby={`l-${title}`} className="rounded-xl border border-border bg-surface p-4">
      <h2 id={`l-${title}`} className="text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      <p className="text-xs text-muted">{note}</p>
      <ul className="mt-2 space-y-3 text-sm">
        {rows.map(({ m, chance }) => (
          <li key={m.id} className="flex items-baseline gap-2">
            <span className="w-10 shrink-0 font-semibold tabular-nums">{Math.round(chance * 100)}%</span>
            <span className="min-w-0 flex-1">
              <Opp m={m} side={m.p1.id === playerId ? 1 : 2} />
              <Link href={`/matches/${m.id}`} className="mt-1.5 block truncate text-xs text-muted hover:underline">
                {displayName(m.tournamentName)}
                {m.round ? ` · ${m.round}` : ""}
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function SeasonReview({ params }: PageProps<"/players/[id]/season/[year]">) {
  const data = await load(params);
  if (!data) notFound();
  const { player, season, matches, stats } = data;
  const mine = (m: SeasonMatch) => (m.p1.id === player.id ? 1 : 2);
  const scored = matches
    .filter((m) => !m.walkover && m.preMatchP1 !== null)
    .map((m) => ({ m, won: m.winner === mine(m), chance: mine(m) === 1 ? m.preMatchP1! : 1 - m.preMatchP1! }));
  const bestWins = scored.filter((x) => x.won).sort((a, b) => a.chance - b.chance).slice(0, 5);
  const toughLosses = scored.filter((x) => !x.won).sort((a, b) => b.chance - a.chance).slice(0, 5);
  const ranks = player.history.filter((h) => h.date.startsWith(String(season)));
  const startRank = ranks[0];
  const endRank = ranks.at(-1);
  const best = ranks.reduce<(typeof ranks)[number] | null>((b, h) => (!b || h.rank < b.rank ? h : b), null);
  const s = stats.season;
  const now = new Date().getUTCFullYear();
  const seasons = Array.from({ length: now - Math.max(FIRST, stats.since ?? FIRST) + 1 }, (_, i) => now - i);

  return (
    <article className="space-y-6">
      <div>
        <Link href={`/players/${player.id}`} className="text-sm text-muted hover:text-foreground">
          ← {player.fullName}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {player.fullName}’s {season} season
        </h1>
        <p className="text-sm text-muted">{TOUR_LABEL[player.tour]} singles in our tracked draws{season === now ? ", so far" : ""}.</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Record", value: `${s.overall.w}–${s.overall.l}` },
          { label: "Titles", value: String(s.titles) },
          { label: "Win rate", value: s.overall.w + s.overall.l ? `${Math.round((100 * s.overall.w) / (s.overall.w + s.overall.l))}%` : "–" },
          {
            label: ranks.length ? "Ranking" : "Ranking (tracked from 2025)",
            value: startRank && endRank ? `#${startRank.rank} → #${endRank.rank}` : "–",
          },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border border-border bg-surface p-3 sm:p-4">
            <dt className="text-xs text-muted">{x.label}</dt>
            <dd className="text-xl font-semibold tabular-nums sm:text-2xl">{x.value}</dd>
          </div>
        ))}
      </dl>
      {best && <p className="-mt-3 text-xs text-muted">Best ranking that season: #{best.rank} ({formatDate(best.date)}).</p>}

      <div className="grid gap-3 md:grid-cols-2">
        <MatchList title="Best wins" note="Wins where our model gave them the smallest chance." rows={bestWins} playerId={player.id} />
        <MatchList title="Toughest losses" note="Losses where they were the biggest favorite." rows={toughLosses} playerId={player.id} />
      </div>

      <PlayerStatsSection season={s} all={stats.all} year={season} since={stats.since} />
      <PlayerTimeline rows={seasonTimeline(matches, player.id)} year={season} />

      <nav aria-label="Other seasons" className="flex flex-wrap gap-2 text-sm">
        {seasons.map((y) => (
          <Link
            key={y}
            href={`/players/${player.id}/season/${y}`}
            aria-current={y === season ? "page" : undefined}
            className={`rounded-lg border px-2.5 py-1 tabular-nums ${y === season ? "border-accent bg-accent-soft font-medium" : "border-border hover:bg-surface-muted"}`}
          >
            {y}
          </Link>
        ))}
      </nav>
    </article>
  );
}
