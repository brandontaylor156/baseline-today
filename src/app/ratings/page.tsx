import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { TrackRecordSection } from "@/components/track-record";
import { getModelInfo } from "@/lib/data/predictions";
import { getRatedPlayers } from "@/lib/data/ratings";
import { getTrackRecord } from "@/lib/data/track-record";
import { isTour, TOUR_LABEL } from "@/lib/format";
import { TOURS } from "@/lib/provider/types";
import { disagreements, MIN_MATCHES, MIN_SURFACE_MATCHES, RATING_VIEWS, rankRatings, type RatedRow, type RatingView } from "@/lib/ratings";

export const metadata: Metadata = {
  title: "Model ratings",
  description: "Elo ratings for active ATP and WTA players, by surface, compared with the ranking, and how accurate the model is.",
};

const VIEW_LABEL: Record<RatingView, string> = { overall: "All courts", hard: "Hard", clay: "Clay", grass: "Grass" };
const pct = (p: number) => `${Math.round(p * 100)}%`;

function Name({ r }: { r: RatedRow }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Flag code={r.countryCode} reserve />
      {r.id !== null ? (
        <Link href={`/players/${r.id}`} className="truncate hover:underline">
          {r.name}
        </Link>
      ) : (
        <span className="truncate">{r.name}</span>
      )}
    </span>
  );
}

function Gap({ r }: { r: RatedRow }) {
  if (r.rank === null) return <span className="text-xs text-muted">outside top 100</span>;
  const gap = r.rank - r.modelRank;
  if (Math.abs(gap) < 3) return <span className="text-xs text-muted">in line</span>;
  return (
    <span className="text-xs tabular-nums">
      <span aria-hidden className={gap > 0 ? "text-accent" : "text-muted"}>
        {gap > 0 ? "▲" : "▼"}
      </span>{" "}
      {gap > 0 ? `${gap} above` : `${-gap} below`} ranking
    </span>
  );
}

function Callout({ title, note, rows }: { title: string; note: string; rows: RatedRow[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <p className="mb-2 text-xs text-muted">{note}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nobody stands out right now.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2">
              <Name r={r} />
              <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">
                model #{r.modelRank} · {r.rank ? `ranked #${r.rank}` : "ranked 100+"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function RatingsPage({ searchParams }: PageProps<"/ratings">) {
  const q = await searchParams;
  const tour = typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const view = RATING_VIEWS.find((v) => v === q.surface) ?? "overall";
  const [players, info, record] = await Promise.all([getRatedPlayers(tour), getModelInfo(), getTrackRecord()]);
  const rows = rankRatings(players, view);
  const { underrated, overrated } = disagreements(rankRatings(players, "overall"));
  const backtest = info.backtest[tour];
  const href = (t: string, v: RatingView) => `/ratings?tour=${t}${v === "overall" ? "" : `&surface=${v}`}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Model ratings</h1>
          <p className="text-sm text-muted">
            Elo ratings from every tracked {TOUR_LABEL[tour]} result since 2015. Active players with {MIN_MATCHES}+ matches.
          </p>
        </div>
        <nav aria-label="Tour" className="flex rounded-lg border border-border bg-surface p-0.5 text-sm">
          {TOURS.map((t) => (
            <Link
              key={t}
              href={href(t, view)}
              aria-current={t === tour ? "page" : undefined}
              className={`rounded-md px-3 py-1 ${t === tour ? "bg-accent font-medium text-background" : "text-muted hover:text-foreground"}`}
            >
              {TOUR_LABEL[t]}
            </Link>
          ))}
        </nav>
      </div>

      <TrackRecordSection record={record} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Callout title="Better than their ranking" note="In the model’s top 30, ranked at least 10 places lower." rows={underrated} />
        <Callout title="Ranking ahead of form" note="In the top 30 of the ranking, rated at least 10 places lower." rows={overrated} />
      </div>

      <section aria-labelledby="table-heading" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="table-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Top 50 · {VIEW_LABEL[view]}
          </h2>
          <nav aria-label="Surface" className="flex flex-wrap gap-1 text-sm">
            {RATING_VIEWS.map((v) => (
              <Link
                key={v}
                href={href(tour, v)}
                aria-current={v === view ? "page" : undefined}
                className={`rounded-md border px-2.5 py-1 ${v === view ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-muted hover:text-foreground"}`}
              >
                {VIEW_LABEL[v]}
              </Link>
            ))}
          </nav>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">
              {TOUR_LABEL[tour]} model ratings, {VIEW_LABEL[view].toLowerCase()}
            </caption>
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th scope="col" className="w-10 px-3 py-2 text-right font-medium">
                  #
                </th>
                <th scope="col" className="w-full px-2 py-2 font-medium">
                  Player
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  Rating
                </th>
                <th scope="col" className="hidden whitespace-nowrap px-2 py-2 text-right font-medium sm:table-cell">
                  Matches
                </th>
                <th scope="col" className="hidden whitespace-nowrap px-3 py-2 text-right font-medium sm:table-cell">
                  Vs ranking
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.slice(0, 50).map((r) => (
                <tr key={r.key}>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.modelRank}</td>
                  <td className="max-w-0 px-2 py-2">
                    <Name r={r} />
                    <span className="block text-xs text-muted sm:hidden">
                      <Gap r={r} />
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{Math.round(r.rating)}</td>
                  <td className="hidden px-2 py-2 text-right tabular-nums text-muted sm:table-cell">
                    {view === "overall" ? r.matches : r.surfaceMatches[view]}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-right sm:table-cell">
                    <Gap r={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          {view === "overall"
            ? "Ratings start at 1500 and move after every match: more after an upset, and more for players with few matches."
            : `Surface view blends the all-court and ${view}-court ratings half and half, like the predictions do; needs ${MIN_SURFACE_MATCHES}+ matches on ${view}.`}
        </p>
      </section>

      {backtest && (
        <section aria-labelledby="accuracy-heading" className="space-y-2">
          <h2 id="accuracy-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            How accurate is it?
          </h2>
          <p className="text-sm">
            Tested on {backtest.n.toLocaleString("en-US")} {TOUR_LABEL[tour]} matches this season, each predicted before it was played: the
            favorite won <strong>{pct(backtest.accuracy)}</strong> of the time.
            {backtest.buckets?.length ? " When the model says a player has a given chance, they win about that often:" : ""}
          </p>
          {backtest.buckets?.length ? (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <table className="w-full text-sm">
                <caption className="sr-only">Model calibration: predicted chance against how often the favorite won</caption>
                <thead className="border-b border-border text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Model said
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      Matches
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      Favorite won
                    </th>
                    <th scope="col" className="hidden w-2/5 px-3 py-2 font-medium sm:table-cell">
                      <span className="sr-only">Chart</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {backtest.buckets.map((b) => (
                    <tr key={b.bucket}>
                      <td className="px-3 py-2 tabular-nums">
                        {b.bucket} <span className="text-xs text-muted">(avg {pct(b.predicted)})</span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted">{b.n.toLocaleString("en-US")}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">{pct(b.actual)}</td>
                      <td aria-hidden className="hidden px-3 py-2 sm:table-cell">
                        <span className="relative block h-2 rounded-full bg-surface-muted">
                          <span className="absolute inset-y-0 left-0 rounded-full bg-chart-line" style={{ width: `${b.actual * 100}%` }} />
                          <span className="absolute -inset-y-1 w-0.5 rounded bg-foreground" style={{ left: `${b.predicted * 100}%` }} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="text-xs text-muted">
            Bar: how often the favorite won. Tick: the model’s average prediction. Estimates, not betting advice; see{" "}
            <Link href="/odds" className="underline underline-offset-2">
              Odds
            </Link>
            .
          </p>
        </section>
      )}
    </div>
  );
}
