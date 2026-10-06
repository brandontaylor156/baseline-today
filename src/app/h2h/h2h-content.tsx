import type { Metadata } from "next";
import Link from "next/link";

import { PlayerAvatar } from "@/components/player-avatar";
import { PlayerResults } from "@/components/player-results";
import { RankRaceChart } from "@/components/rank-race-chart";
import { WikiCredit } from "@/components/wiki-credit";
import { EdgeChart } from "@/components/edge-chart";
import { getHeadToHead } from "@/lib/data/h2h";
import { getRatingWeeks } from "@/lib/data/lab";
import { getModelInfo, predictPair } from "@/lib/data/predictions";
import { getRankingDates, type PlayerDetail } from "@/lib/data/tennis";
import { TOUR_LABEL } from "@/lib/format";
import { edgeOverTime } from "@/lib/lab/edge";
import { h2hPath } from "@/lib/slug";

/** Share card, title and canonical URL for a valid pair. */
export function h2hMetadata(a: PlayerDetail, b: PlayerDetail): Metadata {
  const title = `${a.fullName} vs ${b.fullName}: head-to-head and prediction`;
  const card = `/h2h/card?a=${a.id}&b=${b.id}`;
  return {
    title,
    description: `${a.fullName} vs ${b.fullName} head-to-head record by surface, every meeting since 2015, the ranking race and our model's win chances on hard, clay and grass.`,
    alternates: { canonical: h2hPath({ id: a.id, name: a.fullName }, { id: b.id, name: b.fullName }) },
    openGraph: { title, images: [{ url: card, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", images: [card] },
  };
}

function Side({ player, wins, align }: { player: PlayerDetail; wins: number; align: "left" | "right" }) {
  const rank = player.history.at(-1)?.rank;
  return (
    <div className={`flex flex-1 flex-col items-center gap-2 text-center ${align === "right" ? "sm:items-end sm:text-right" : "sm:items-start sm:text-left"}`}>
      <PlayerAvatar name={player.fullName} image={player.image} countryCode={player.countryCode} size="lg" />
      <Link href={`/players/${player.id}`} className="text-lg font-semibold hover:underline sm:text-xl">
        {player.fullName}
      </Link>
      <span className="text-xs text-muted">{rank ? `#${rank} ${TOUR_LABEL[player.tour]}` : TOUR_LABEL[player.tour]}</span>
      <span className="text-5xl font-semibold tabular-nums">{wins}</span>
    </div>
  );
}

/** Record, ranking race, model chances and every meeting for two players of the same tour. */
export async function H2HContent({ a, b }: { a: PlayerDetail; b: PlayerDetail }) {
  const [h2h, weeksA, weeksB, info, ...model] = await Promise.all([
    getHeadToHead(a.id, b.id),
    getRatingWeeks(a.id),
    getRatingWeeks(b.id),
    getModelInfo(),
    ...(["Hard", "Clay", "Grass"] as const).map((s) => predictPair(a.tour, a.id, b.id, s)),
  ]);
  const edge = edgeOverTime(weeksA, weeksB, info.calibration[a.tour] ?? 1);
  const meetings = h2h.meetings
    .filter((m) => m.resultDetail !== "walkover" && m.winner !== null && m.tournamentStart)
    .map((m) => ({
      date: m.tournamentStart!,
      aWon: (m.winner === 1 ? m.player1 : m.player2)?.id === a.id,
      label: `${m.tournament.name}${m.round ? `, ${m.round}` : ""}`,
    }));
  const predictions = (model as ({ p: number; minMatches: number } | null)[]).map((p, i) => ({ surface: ["Hard", "Clay", "Grass"][i], p }));
  return (
    <>
      <section aria-label="Record" className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <Side player={a} wins={h2h.winsA} align="left" />
          <span className="self-center text-sm font-medium text-muted">vs</span>
          <Side player={b} wins={h2h.winsB} align="right" />
        </div>
        {h2h.bySurface.length > 0 && (
          <dl className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-1 border-t border-border pt-4 text-sm">
            {h2h.bySurface.map((s) => (
              <div key={s.surface} className="flex gap-2">
                <dt className="text-muted">{s.surface}</dt>
                <dd className="font-medium tabular-nums">
                  {s.a}–{s.b}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {edge.length > 8 && (
        <section aria-labelledby="edge-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <h2 id="edge-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            {a.fullName}’s edge over time
          </h2>
          <EdgeChart points={edge} meetings={meetings} nameA={a.fullName} nameB={b.fullName} />
        </section>
      )}

      {(a.history.length > 1 || b.history.length > 1) && (
        <section aria-labelledby="race-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <h2 id="race-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Ranking race
          </h2>
          <RankRaceChart
            a={{ name: a.fullName, history: a.history }}
            b={{ name: b.fullName, history: b.history }}
            tourDates={await getRankingDates(a.tour)}
          />
        </section>
      )}

      {predictions.some((x) => x.p) && (
        <section aria-labelledby="model-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <h2 id="model-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            If they played today
          </h2>
          <dl className="space-y-2.5">
            {predictions.map(({ surface, p }) =>
              p ? (
                <div key={surface} className="grid grid-cols-[4rem_2.5rem_1fr_2.5rem] items-center gap-2 text-sm tabular-nums">
                  <dt className="text-muted">{surface}</dt>
                  <dd className="text-right font-semibold">{Math.round(p.p * 100)}%</dd>
                  <dd aria-hidden className="flex h-2 overflow-hidden rounded-full bg-surface-muted">
                    <span className="bg-chart-line" style={{ width: `${p.p * 100}%` }} />
                  </dd>
                  <dd className="font-semibold">{Math.round((1 - p.p) * 100)}%</dd>
                </div>
              ) : null,
            )}
          </dl>
          <p className="mt-3 text-xs text-muted">
            Model win probability for {a.fullName} (left) and {b.fullName} (right), from surface-aware Elo ratings.{" "}
            <Link href="/odds" className="underline underline-offset-2">
              How the model works
            </Link>
            .
          </p>
        </section>
      )}

      <section aria-labelledby="meetings-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 id="meetings-heading" className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Meetings{h2h.meetings.length ? ` · ${h2h.meetings.length}` : ""}
        </h2>
        {h2h.meetings.length === 0 ? (
          <p className="py-3 text-sm text-muted">No meetings in the tracked draws.</p>
        ) : (
          <>
            <p className="mb-1 text-xs text-muted">From {a.fullName}’s side.</p>
            <PlayerResults playerId={a.id} results={h2h.meetings} />
          </>
        )}
        <WikiCredit sources={h2h.sources} className="mt-3" />
      </section>

      <Link href={`/h2h?a=${a.id}`} className="inline-block text-sm text-accent hover:underline">
        Compare {a.fullName} with someone else →
      </Link>
    </>
  );
}
