import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Flag } from "@/components/flag";
import { displayName } from "@/lib/data/tournaments";
import { getRecapWeeks, getWeekRecap } from "@/lib/data/weekly";
import { TOUR_LABEL } from "@/lib/format";
import type { SeasonMatch } from "@/lib/leaders";
import { isMonday, weekLabel } from "@/lib/weeks";

export const revalidate = 3600;

const pct = (p: number) => `${Math.round(p * 100)}%`;

async function load(params: PageProps<"/week/[monday]">["params"]) {
  const { monday } = await params;
  return isMonday(monday) ? getWeekRecap(monday) : null;
}

export async function generateMetadata({ params }: PageProps<"/week/[monday]">): Promise<Metadata> {
  const recap = await load(params);
  if (!recap) return { title: "Week in tennis" };
  const label = weekLabel(recap.monday);
  const champs = recap.champions
    .slice(0, 3)
    .map((c) => c.tournament.champion?.name)
    .filter(Boolean)
    .join(", ");
  const title = `Tennis week ${label}: champions, upsets and ranking movers`;
  const description = `${recap.champions.length} tournaments finished${champs ? ` (champions include ${champs})` : ""}. The biggest upsets, ATP and WTA ranking movers and how our model did.`;
  return { title, description, openGraph: { title, description } };
}

function Player({ p }: { p: SeasonMatch["p1"] }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Flag code={p.country} reserve />
      {p.id !== null ? (
        <Link href={`/players/${p.id}`} className="truncate hover:underline">
          {p.name}
        </Link>
      ) : (
        <span className="truncate">{p.name}</span>
      )}
    </span>
  );
}

/** Set scores from the winner's side: "6-4 3-6 7-6". */
function score(m: SeasonMatch): string {
  return m.sets
    .filter((s) => s.p1 !== null && s.p2 !== null)
    .map((s) => (m.winner === 1 ? `${s.p1}-${s.p2}` : `${s.p2}-${s.p1}`))
    .join(" ");
}

export default async function WeekPage({ params }: PageProps<"/week/[monday]">) {
  const recap = await load(params);
  if (!recap) notFound();
  const weeks = await getRecapWeeks(Number(recap.monday.slice(0, 4)));
  const i = weeks.indexOf(recap.monday);
  const newer = i > 0 ? weeks[i - 1] : null;
  const older = i >= 0 && i < weeks.length - 1 ? weeks[i + 1] : null;
  const model = recap.model.total ? recap.model.correct / recap.model.total : null;

  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <Link href="/week" className="text-sm text-muted hover:text-foreground">
          ← All weeks
        </Link>
        <p className="text-sm font-medium text-accent">Week in tennis</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{weekLabel(recap.monday)}</h1>
        <p className="text-muted">
          {recap.champions.length} {recap.champions.length === 1 ? "tournament" : "tournaments"} finished, {recap.matches} matches.
          {model !== null && (
            <>
              {" "}
              Our model called{" "}
              <span className="font-semibold text-foreground">
                {recap.model.correct} of {recap.model.total} ({pct(model)})
              </span>
              .
            </>
          )}
        </p>
      </header>

      <section aria-labelledby="champions-heading" className="space-y-2">
        <h2 id="champions-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Champions
        </h2>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
          {recap.champions.map(({ tournament: t, final }) => {
            const winner = final ? (final.winner === 1 ? final.p1 : final.p2) : null;
            const loser = final ? (final.winner === 1 ? final.p2 : final.p1) : null;
            return (
              <li key={t.id} className="flex flex-col gap-2 px-4 py-3">
                <p className="text-xs text-muted">
                  <Link href={`/tournaments/${t.id}`} className="font-medium text-foreground hover:underline">
                    {displayName(t.name)}
                  </Link>{" "}
                  · {TOUR_LABEL[t.tour]}
                  {t.category ? ` · ${t.category}` : ""}
                  {t.surface ? ` · ${t.surface}` : ""}
                </p>
                {winner && loser && final ? (
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
                    <span aria-hidden>🏆</span>
                    <span className="font-semibold">
                      <Player p={winner} />
                    </span>
                    <span className="text-muted">beat</span>
                    <Player p={loser} />
                    <Link href={`/matches/${final.id}`} className="font-mono text-xs text-muted tabular-nums hover:underline">
                      {score(final) || "final"}
                    </Link>
                  </p>
                ) : t.champion ? (
                  <p>🏆 {t.champion.name}</p>
                ) : (
                  <p className="text-muted">Champion not in the tracked draw yet.</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {recap.upsets.length > 0 && (
        <section aria-labelledby="upsets-heading" className="space-y-2">
          <h2 id="upsets-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Biggest upsets
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
            {recap.upsets.map(({ match: m, winnerChance }) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <span className="w-10 shrink-0 font-semibold tabular-nums text-accent">{pct(winnerChance)}</span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-2">
                  <Player p={m.winner === 1 ? m.p1 : m.p2} />
                  <span className="text-muted">beat</span>
                  <Player p={m.winner === 1 ? m.p2 : m.p1} />
                </span>
                <Link href={`/matches/${m.id}`} className="text-xs text-muted hover:underline">
                  {displayName(m.tournamentName)}
                  {m.round ? ` · ${m.round}` : ""}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">The winner’s chance according to our model before the match.</p>
        </section>
      )}

      {recap.movers.length > 0 && (
        <section aria-labelledby="movers-heading" className="space-y-2">
          <h2 id="movers-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Ranking movers
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {recap.movers.map((m) => (
              <div key={m.tour} className="rounded-xl border border-border bg-surface p-4 text-sm">
                <h3 className="mb-2 font-semibold">
                  <Link href={`/rankings/${m.tour}?date=${m.date}`} className="hover:underline">
                    {TOUR_LABEL[m.tour]} top 100
                  </Link>
                </h3>
                <ul className="space-y-1.5">
                  {[...m.up, ...m.down].map((r) => (
                    <li key={r.player.id} className="flex items-center gap-2">
                      <span className={`w-10 shrink-0 text-xs font-semibold tabular-nums ${r.movement! > 0 ? "text-up" : "text-down"}`}>
                        {r.movement! > 0 ? "▲" : "▼"}
                        {Math.abs(r.movement!)}
                        <span className="sr-only">{r.movement! > 0 ? " places up" : " places down"}</span>
                      </span>
                      <Flag code={r.player.countryCode} reserve />
                      <Link href={`/players/${r.player.id}`} className="min-w-0 truncate hover:underline">
                        {r.player.fullName}
                      </Link>
                      <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">#{r.rank}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <nav aria-label="Other weeks" className="flex justify-between gap-4 text-sm">
        {older ? (
          <Link href={`/week/${older}`} className="text-accent hover:underline">
            ← {weekLabel(older)}
          </Link>
        ) : (
          <span />
        )}
        {newer ? (
          <Link href={`/week/${newer}`} className="text-right text-accent hover:underline">
            {weekLabel(newer)} →
          </Link>
        ) : null}
      </nav>
      <p className="text-xs text-muted">Results from Wikipedia draw pages (CC BY-SA 4.0), linked on each tournament page.</p>
    </article>
  );
}
