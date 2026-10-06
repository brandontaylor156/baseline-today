import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { FavoriteButton } from "@/components/favorite-button";
import { PlayerAvatar } from "@/components/player-avatar";
import { PlayerResults } from "@/components/player-results";
import { PlayerStatsSection } from "@/components/player-stats";
import { PlayerTimeline } from "@/components/player-timeline";
import { RankChart } from "@/components/rank-chart";
import { RatingChart } from "@/components/rating-chart";
import { WikiCredit } from "@/components/wiki-credit";
import { getRatingHistory } from "@/lib/data/ratings";
import { getPlayerResults } from "@/lib/data/results";
import { getSeasonMatches } from "@/lib/data/season";
import { getPlayerStats } from "@/lib/data/stats";
import { getPlayer, getRankingDates } from "@/lib/data/tennis";
import { bestRank, formatDate, formatHeight, formatPlays, formatPoints, formatWeight, TOUR_LABEL } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { playerLd } from "@/lib/structured-data";
import { seasonTimeline } from "@/lib/timeline";

export const revalidate = 3600;

// No pages at build time; each player page is rendered on first visit, then cached (ISR).
export function generateStaticParams() {
  return [];
}

async function load(params: PageProps<"/players/[id]">["params"]) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return null;
  return getPlayer(Number(id));
}

export async function generateMetadata({ params }: PageProps<"/players/[id]">): Promise<Metadata> {
  const player = await load(params);
  if (!player) return {};
  const latest = player.history.at(-1);
  const description = [
    `${TOUR_LABEL[player.tour]} singles`,
    latest ? `ranked #${latest.rank}` : null,
    player.countryName,
  ]
    .filter(Boolean)
    .join(" · ");
  return { title: player.fullName, description, openGraph: { title: player.fullName, description } };
}

export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const player = await load(params);
  if (!player) notFound();

  const year = new Date().getUTCFullYear();
  const [results, tourDates, stats, seasonMatches, ratingHistory] = await Promise.all([
    getPlayerResults(player.id),
    getRankingDates(player.tour),
    getPlayerStats(player.id, year),
    getSeasonMatches(player.tour, year),
    getRatingHistory(player.id),
  ]);
  const latest = player.history.at(-1);
  const best = bestRank(player.history);
  // The provider's birthplace is often just the country; don't repeat it.
  const birthPlace = player.birthPlace && player.birthPlace !== player.countryName ? player.birthPlace : null;
  const facts: [string, string | null][] = [
    ["Country", player.countryName ?? player.countryCode],
    ["Born", [player.birthDate && formatDate(player.birthDate), birthPlace].filter(Boolean).join(" · ") || null],
    ["Plays", formatPlays(player.plays)],
    ["Height", formatHeight(player.heightCm)],
    ["Weight", formatWeight(player.weightKg)],
    ["Turned pro", player.turnedPro ? String(player.turnedPro) : null],
  ];

  return (
    <article className="space-y-6">
      <JsonLd
        data={playerLd({
          id: player.id,
          tour: player.tour,
          fullName: player.fullName,
          countryName: player.countryName,
          birthDate: player.birthDate,
          birthPlace: player.birthPlace,
          heightCm: player.heightCm,
          imageUrl: player.image?.imageUrl ?? null,
        })}
      />
      <Link href={`/rankings/${player.tour}`} className="text-sm text-muted hover:text-foreground">
        ← {TOUR_LABEL[player.tour]} rankings
      </Link>

      <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-end sm:text-left">
        <figure className="flex flex-col items-center gap-1">
          <PlayerAvatar name={player.fullName} image={player.image} countryCode={player.countryCode} size="lg" />
          {player.image && (
            <figcaption className="max-w-36 text-[10px] leading-tight text-muted">
              <a href={player.image.sourceUrl} className="hover:underline">
                {player.image.author}
              </a>
              {", "}
              {player.image.licenseUrl ? (
                <a href={player.image.licenseUrl} className="hover:underline">
                  {player.image.license}
                </a>
              ) : (
                player.image.license
              )}
            </figcaption>
          )}
        </figure>
        <div>
          <p className="text-sm font-medium text-accent">{TOUR_LABEL[player.tour]}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{player.fullName}</h1>
          <div className="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:gap-4">
            <FavoriteButton playerId={player.id} initialCount={player.favoriteCount} />
            <Link
              href={`/h2h?a=${player.id}`}
              className="inline-flex items-center rounded-lg border border-border bg-surface px-3.5 py-1.5 text-sm font-medium hover:bg-surface-muted"
            >
              Head-to-head
            </Link>
            <Link
              href={`/players/${player.id}/rivals`}
              className="inline-flex items-center rounded-lg border border-border bg-surface px-3.5 py-1.5 text-sm font-medium hover:bg-surface-muted"
            >
              All rivals
            </Link>
            <Link
              href={`/lab/similar?p=${player.id}`}
              className="inline-flex items-center rounded-lg border border-border bg-surface px-3.5 py-1.5 text-sm font-medium hover:bg-surface-muted"
            >
              Similar players
            </Link>
            <Link
              href={`/lab/explorer?p=${player.id}`}
              className="inline-flex items-center rounded-lg border border-border bg-surface px-3.5 py-1.5 text-sm font-medium hover:bg-surface-muted"
            >
              Explore matches
            </Link>
            <a
              href={`${SITE_URL.replace(/^https:/, "webcal:")}/calendar/players/${player.id}.ics`}
              className="inline-flex items-center rounded-lg border border-border bg-surface px-3.5 py-1.5 text-sm font-medium hover:bg-surface-muted"
              title="Subscribe in Google Calendar, Apple Calendar or Outlook"
            >
              Add to calendar
            </a>
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Current rank" value={latest ? `#${latest.rank}` : "Unranked"} />
        <Stat label="Points" value={formatPoints(latest?.points ?? null)} />
        <Stat
          label="Best tracked rank"
          value={best ? `#${best.rank}` : "–"}
          hint={best ? `first reached ${formatDate(best.date)}` : undefined}
        />
        <Stat
          label={`${results.season} record`}
          value={results.wins + results.losses > 0 ? `${results.wins}–${results.losses}` : "–"}
          hint="tour-level, from tracked draws"
        />
      </dl>

      {player.history.length > 1 && (
        <section aria-labelledby="chart-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <h2 id="chart-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Ranking history
          </h2>
          <p className="mb-3 text-xs text-muted">Weekly {TOUR_LABEL[player.tour]} rank while in the top 100</p>
          <RankChart history={player.history} tourDates={tourDates} tourLabel={TOUR_LABEL[player.tour]} />
        </section>
      )}

      {ratingHistory.length > 1 && (
        <section aria-labelledby="rating-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <h2 id="rating-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Model rating
          </h2>
          <p className="mb-3 text-xs text-muted">
            Weekly Elo rating from tracked results; higher is stronger. Everyone starts at 1500 in January 2015, so 2015 is a
            warm-up.{" "}
            <Link href={`/ratings?tour=${player.tour}`} className="underline underline-offset-2">
              All ratings
            </Link>
          </p>
          <RatingChart history={ratingHistory} />
        </section>
      )}

      <section aria-labelledby="bio-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 id="bio-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Profile
        </h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts
            .filter((f): f is [string, string] => Boolean(f[1]))
            .map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-border pb-2 sm:block sm:border-0 sm:pb-0">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="text-right font-medium sm:text-left">{value}</dd>
              </div>
            ))}
        </dl>
      </section>

      <PlayerStatsSection season={stats.season} all={stats.all} year={year} since={stats.since} />

      <PlayerTimeline rows={seasonTimeline(seasonMatches, player.id)} year={year} />

      {stats.since !== null && (
        <nav aria-label="Season reviews" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Season reviews</span>
          {Array.from({ length: year - Math.max(2015, stats.since) + 1 }, (_, i) => year - i).map((y) => (
            <Link key={y} href={`/players/${player.id}/season/${y}`} className="rounded-lg border border-border px-2.5 py-1 tabular-nums hover:bg-surface-muted">
              {y}
            </Link>
          ))}
        </nav>
      )}

      {results.recent.length > 0 && (
        <section aria-labelledby="results-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <h2 id="results-heading" className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
            Recent results
          </h2>
          <PlayerResults playerId={player.id} results={results.recent} />
          <WikiCredit sources={results.sources} className="mt-3" />
        </section>
      )}

      <p className="text-xs text-muted">
        Best tracked rank counts only the ranking snapshots stored since this site began recording. Season record counts
        finished main-draw matches at the ATP and WTA events tracked here (walkovers excluded).
      </p>
    </article>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</dd>
      {hint && <dd className="mt-0.5 text-[11px] leading-tight text-muted">{hint}</dd>}
    </div>
  );
}
