import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";
import { getUpcoming, type Matchup, type Side } from "@/lib/data/predictions";
import { displayName } from "@/lib/data/tournaments";
import { TOUR_LABEL } from "@/lib/format";
import { formatAmerican } from "@/lib/model/odds";

export const metadata: Metadata = {
  title: "Odds and predictions",
  description: "Upcoming ATP and WTA matches with model win probabilities and the best bookmaker prices.",
};

const pct = (p: number) => `${Math.round(p * 100)}%`;
const signedPct = (p: number) => `${p >= 0 ? "+" : "−"}${Math.abs(Math.round(p * 1000) / 10)} pts`;

function Name({ side }: { side: Side }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Flag code={side.countryCode} reserve />
      {side.id !== null ? (
        <Link href={`/players/${side.id}`} className="truncate hover:underline">
          {side.name}
        </Link>
      ) : (
        <span className="truncate">{side.name}</span>
      )}
      {side.rank && <span className="shrink-0 text-xs text-muted">#{side.rank}</span>}
    </span>
  );
}

function ProbabilityBar({ p }: { p: number }) {
  return (
    <span aria-hidden className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
      <span className="bg-chart-line" style={{ width: `${p * 100}%` }} />
    </span>
  );
}

function MatchupRow({ m }: { m: Matchup }) {
  const thin = m.minMatches < 10;
  return (
    <li className="space-y-1.5 px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>{m.round ?? ""}</span>
        <span>{m.scheduledAt ? <LocalTime iso={m.scheduledAt} fallback={null} /> : "Time TBA"}</span>
      </div>
      {[1, 2].map((s) => {
        const side = s === 1 ? m.p1 : m.p2;
        const model = s === 1 ? m.model1 : 1 - m.model1;
        const best = s === 1 ? m.market.best1 : m.market.best2;
        const fair = m.market.fair1 === null ? null : s === 1 ? m.market.fair1 : 1 - m.market.fair1;
        return (
          <div key={s} className="grid grid-cols-[1fr_auto] items-center gap-x-3 sm:grid-cols-[1fr_9rem_7rem]">
            <Name side={side} />
            <span className="flex items-center gap-2 tabular-nums">
              <span className="w-9 text-right font-semibold">{pct(model)}</span>
              <span className="hidden w-16 sm:block">
                <ProbabilityBar p={model} />
              </span>
            </span>
            <span className="col-span-2 text-right text-xs tabular-nums text-muted sm:col-span-1">
              {best ? (
                <>
                  <span className="font-medium text-foreground">{formatAmerican(best.american)}</span> {best.vendor}
                  {fair !== null && <span className="block">market {pct(fair)}</span>}
                </>
              ) : null}
            </span>
          </div>
        );
      })}
      {thin && <p className="text-xs text-muted">Limited match history for one player: model estimate is rough.</p>}
    </li>
  );
}

export default async function OddsPage() {
  await connection();
  const { matchups, info } = await getUpcoming();
  const withOdds = matchups.filter((m) => m.edge !== null);
  const edges = withOdds
    .filter((m) => m.edge!.edge >= 0.03 && m.minMatches >= 10)
    .sort((a, b) => b.edge!.ev - a.edge!.ev)
    .slice(0, 8);

  const groups = new Map<number, Matchup[]>();
  for (const m of matchups) groups.set(m.tournament.id, [...(groups.get(m.tournament.id) ?? []), m]);
  const accuracy = ["atp", "wta"].map((t) => info.backtest[t]).filter(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Odds and predictions</h1>
        <p className="text-sm text-muted">Upcoming matches with our model’s win probability and, where available, the best bookmaker price.</p>
      </div>

      <aside role="note" className="rounded-xl border border-border bg-surface-muted p-4 text-sm">
        <p className="font-medium">Estimates, not betting advice.</p>
        <p className="mt-1 text-muted">
          The model is an Elo rating built from past results. This season it picked the winner in{" "}
          {accuracy.length
            ? accuracy.map((a, i) => `${Math.round(a!.accuracy * 100)}% of ${a!.n} ${["ATP", "WTA"][i]} matches`).join(" and ")
            : "about 63% of matches"}
          . Bookmakers are usually more accurate, and no model guarantees a profit. Betting is for adults only (18+, 21+ in
          some places). If gambling stops being fun, help is free and confidential:{" "}
          <a href="https://www.ncpgambling.org/help-treatment/" className="underline underline-offset-2">
            1-800-GAMBLER
          </a>
          .
        </p>
      </aside>

      {withOdds.length > 0 && (
        <section aria-labelledby="edges-heading" className="space-y-2">
          <h2 id="edges-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Where the model disagrees with the market
          </h2>
          {edges.length === 0 ? (
            <p className="text-sm text-muted">The model and the bookmakers broadly agree on every priced match right now.</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
              {edges.map((m) => {
                const e = m.edge!;
                const pick = e.side === 1 ? m.p1 : m.p2;
                return (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <span className="min-w-0">
                      <span className="font-medium">{pick.name}</span>
                      <span className="text-muted"> vs {(e.side === 1 ? m.p2 : m.p1).name}</span>
                      <span className="block text-xs text-muted">{displayName(m.tournament.name)}</span>
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="font-semibold">{formatAmerican(e.price.american)}</span> <span className="text-xs text-muted">{e.price.vendor}</span>
                      <span className="block text-xs text-muted">
                        model {pct(e.model)} vs market {pct(e.market)} ({signedPct(e.edge)})
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {matchups.length > 0 && withOdds.length === 0 && (
        <p className="text-sm text-muted">No bookmaker prices yet: showing model probabilities only.</p>
      )}

      {matchups.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
          No upcoming matches yet. They appear as soon as the next draws are published.
        </p>
      ) : (
        [...groups.values()].map((list) => {
          const t = list[0].tournament;
          return (
            <section key={t.id} aria-labelledby={`o-${t.id}`} className="space-y-2">
              <h2 id={`o-${t.id}`} className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
                <Link href={`/tournaments/${t.id}`} className="hover:underline">
                  {displayName(t.name)}
                </Link>
                <span className="text-xs font-normal text-muted">
                  {TOUR_LABEL[list[0].tour]}
                  {t.category ? ` · ${t.category}` : ""}
                  {t.surface ? ` · ${t.surface}` : ""}
                </span>
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {list.map((m) => (
                  <MatchupRow key={m.id} m={m} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <p className="text-xs text-muted">
        How it works: every player has an overall and per-surface Elo rating updated after each result since 2024; probabilities
        are calibrated on last season so “60%” means about 60%. Market probabilities remove the bookmakers’ margin. Odds come from
        BALLDONTLIE when enabled; upcoming pairings without times come from Wikipedia draws.
      </p>
    </div>
  );
}
