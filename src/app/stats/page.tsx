import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { getSeasonMatches } from "@/lib/data/season";
import { displayName } from "@/lib/data/tournaments";
import { isTour, TOUR_LABEL } from "@/lib/format";
import { leaderRows, topBy, upsets, type LeaderMetric, type LeaderRow } from "@/lib/leaders";
import { TOURS } from "@/lib/provider/types";

export const metadata: Metadata = {
  title: "Stats",
  description: "ATP and WTA season leaderboards (wins, win rate, titles, comebacks, tiebreaks) and the biggest upsets.",
};

const BOARDS: { metric: LeaderMetric; title: string; value: (r: LeaderRow) => string }[] = [
  { metric: "wins", title: "Most wins", value: (r) => `${r.w}–${r.l}` },
  { metric: "pct", title: "Best win rate (15+ matches)", value: (r) => `${Math.round(r.pct * 100)}%` },
  { metric: "titles", title: "Titles", value: (r) => String(r.titles) },
  { metric: "comebacks", title: "Comeback wins", value: (r) => String(r.comebacks) },
  { metric: "tiebreaksWon", title: "Tiebreaks won", value: (r) => String(r.tiebreaksWon) },
];

function PlayerName({ id, name, country }: { id: number | null; name: string; country: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Flag code={country} reserve />
      {id !== null ? (
        <Link href={`/players/${id}`} className="truncate hover:underline">
          {name}
        </Link>
      ) : (
        <span className="truncate">{name}</span>
      )}
    </span>
  );
}

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const q = await searchParams;
  const tour = typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const season = new Date().getUTCFullYear();
  const matches = await getSeasonMatches(tour, season);
  const rows = leaderRows(matches);
  const list = upsets(matches, 0.3, 15);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Stats</h1>
          <p className="text-sm text-muted">
            {season} {TOUR_LABEL[tour]} season · {matches.length.toLocaleString("en-US")} tracked matches ·{" "}
            <Link href={`/ratings?tour=${tour}`} className="font-medium text-accent hover:underline">
              Model ratings →
            </Link>
          </p>
        </div>
        <nav aria-label="Tour" className="flex rounded-lg border border-border bg-surface p-0.5 text-sm">
          {TOURS.map((t) => (
            <Link
              key={t}
              href={`/stats?tour=${t}`}
              aria-current={t === tour ? "page" : undefined}
              className={`rounded-md px-3 py-1 ${t === tour ? "bg-accent font-medium text-background" : "text-muted hover:text-foreground"}`}
            >
              {TOUR_LABEL[t]}
            </Link>
          ))}
        </nav>
      </div>

      <section aria-label="Leaderboards" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BOARDS.map((b) => {
          const top = topBy(rows, b.metric, 8);
          return (
            <div key={b.metric} className="rounded-xl border border-border bg-surface p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{b.title}</h2>
              <ol className="space-y-1.5 text-sm">
                {top.map((r, i) => (
                  <li key={r.key} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                    <PlayerName id={r.id} name={r.name} country={r.country} />
                    <span className="ml-auto shrink-0 font-semibold tabular-nums">{b.value(r)}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="upsets-heading" className="space-y-2">
        <h2 id="upsets-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Biggest upsets
        </h2>
        <p className="text-xs text-muted">Wins where our model gave the winner the smallest chance before the match.</p>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
          {list.map(({ match: m, winnerChance }) => {
            const winner = m.winner === 1 ? m.p1 : m.p2;
            const loser = m.winner === 1 ? m.p2 : m.p1;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="w-12 shrink-0 font-semibold tabular-nums text-accent">{Math.round(winnerChance * 100)}%</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-1.5">
                    <PlayerName id={winner.id} name={winner.name} country={winner.country} />
                    <span className="text-muted">beat</span>
                    <PlayerName id={loser.id} name={loser.name} country={loser.country} />
                  </span>
                  <Link href={`/tournaments/${m.tournamentId}`} className="text-xs text-muted hover:underline">
                    {displayName(m.tournamentName)}
                    {m.round ? ` · ${m.round}` : ""}
                  </Link>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="text-xs text-muted">From tracked draws (Wikipedia and BALLDONTLIE); walkovers excluded.</p>
    </div>
  );
}
