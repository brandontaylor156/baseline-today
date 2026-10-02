import Link from "next/link";

import { Flag } from "@/components/flag";
import { MatchCard } from "@/components/match-card";
import { Movers } from "@/components/movers";
import { PlayerAvatar } from "@/components/player-avatar";
import { WikiCredit } from "@/components/wiki-credit";
import { getRecentResults } from "@/lib/data/results";
import { getSeasonMatches } from "@/lib/data/season";
import { getRankingDates, getRankings, type RankingRow } from "@/lib/data/tennis";
import { calendarSections, dateRange, displayName, getSeasonTournaments } from "@/lib/data/tournaments";
import { formatPoints, TOUR_LABEL } from "@/lib/format";
import { upsets } from "@/lib/leaders";
import { TOURS, type Tour } from "@/lib/provider/types";

export const revalidate = 900;

function TopTen({ tour, rows }: { tour: Tour; rows: RankingRow[] }) {
  return (
    <section aria-labelledby={`top-${tour}`} className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id={`top-${tour}`} className="text-sm font-semibold uppercase tracking-wide text-muted">
          {TOUR_LABEL[tour]} top 10
        </h2>
        <Link href={`/rankings/${tour}`} className="text-xs font-medium text-accent hover:underline">
          Full rankings →
        </Link>
      </div>
      <ol className="space-y-1.5 text-sm">
        {rows.slice(0, 10).map((r) => (
          <li key={r.player.id}>
            <Link href={`/players/${r.player.id}`} className="flex items-center gap-2.5 hover:underline">
              <span className="w-5 text-right font-semibold tabular-nums">{r.rank}</span>
              <PlayerAvatar name={r.player.fullName} image={r.player.image} />
              <Flag code={r.player.countryCode} reserve />
              <span className="min-w-0 flex-1 truncate">{r.player.fullName}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">{formatPoints(r.points)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function Home() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const season = now.getUTCFullYear();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);

  const [tournaments, recent, ...rest] = await Promise.all([
    getSeasonTournaments(season),
    getRecentResults(now, { cached: true }),
    ...TOURS.map(async (t) => {
      const [latest] = await getRankingDates(t);
      return latest ? getRankings(t, latest) : [];
    }),
    ...TOURS.map((t) => getSeasonMatches(t, season)),
  ]);
  const rankings = { atp: rest[0] as RankingRow[], wta: rest[1] as RankingRow[] };
  const seasonMatches = [...(rest[2] as Awaited<ReturnType<typeof getSeasonMatches>>), ...(rest[3] as Awaited<ReturnType<typeof getSeasonMatches>>)];
  const { now: thisWeek } = calendarSections(tournaments, today);
  const weekUpsets = upsets(seasonMatches.filter((m) => m.date >= weekAgo), 0.3, 5);
  const latest = recent.groups.flatMap((g) => g.results.slice(0, 2)).slice(0, 4);
  const sources = recent.groups.flatMap((g) => g.sources).filter((s, i, all) => all.findIndex((x) => x.url === s.url) === i);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium text-accent">This week in tennis</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Baseline Today</h1>
        <p className="mt-1 text-sm text-muted">ATP and WTA rankings, results, upsets and predictions, updated through the day.</p>
      </header>

      {thisWeek.length > 0 && (
        <section aria-labelledby="week-heading" className="space-y-2">
          <h2 id="week-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            On this week
          </h2>
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {thisWeek.map((t) => (
              <li key={t.id} className="shrink-0">
                <Link href={`/tournaments/${t.id}`} className="block w-56 rounded-xl border border-border bg-surface p-3 hover:bg-surface-muted">
                  <span className="block truncate font-medium">{displayName(t.name)}</span>
                  <span className="block truncate text-xs text-muted">
                    {TOUR_LABEL[t.tour]} · {t.category} · {dateRange(t.startDate, t.endDate)}
                  </span>
                  {t.champion && <span className="mt-1 block truncate text-xs">🏆 {t.champion.name}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {latest.length > 0 && (
        <section aria-labelledby="latest-heading" className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 id="latest-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Latest results
            </h2>
            <Link href="/results" className="text-xs font-medium text-accent hover:underline">
              All results →
            </Link>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {latest.map((r) => (
              <li key={r.id}>
                <MatchCard match={r} />
              </li>
            ))}
          </ul>
          <WikiCredit sources={sources.slice(0, 4)} />
        </section>
      )}

      {weekUpsets.length > 0 && (
        <section aria-labelledby="upsets-heading" className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 id="upsets-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Upsets this week
            </h2>
            <Link href="/stats" className="text-xs font-medium text-accent hover:underline">
              More stats →
            </Link>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
            {weekUpsets.map(({ match: m, winnerChance }) => {
              const w = m.winner === 1 ? m.p1 : m.p2;
              const l = m.winner === 1 ? m.p2 : m.p1;
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-10 shrink-0 font-semibold tabular-nums text-accent">{Math.round(winnerChance * 100)}%</span>
                  <span className="min-w-0 flex-1 truncate">
                    {w.name} <span className="text-muted">beat</span> {l.name}
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted sm:block">{displayName(m.tournamentName)}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">The winner’s chance according to our model before the match.</p>
        </section>
      )}

      <section aria-labelledby="movers-heading" className="space-y-2">
        <h2 id="movers-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Ranking movers
        </h2>
        <Movers rows={[...rankings.atp, ...rankings.wta]} />
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <TopTen tour="atp" rows={rankings.atp} />
        <TopTen tour="wta" rows={rankings.wta} />
      </div>
    </div>
  );
}
