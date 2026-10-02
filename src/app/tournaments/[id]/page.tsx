import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MatchCard } from "@/components/match-card";
import { MatchupRow } from "@/components/matchup-row";
import { WikiCredit } from "@/components/wiki-credit";
import { getUpcoming } from "@/lib/data/predictions";
import { dateRange, displayName, getTournament } from "@/lib/data/tournaments";
import { TOUR_LABEL } from "@/lib/format";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

async function load(params: PageProps<"/tournaments/[id]">["params"]) {
  const { id } = await params;
  return /^\d+$/.test(id) ? getTournament(Number(id)) : null;
}

export async function generateMetadata({ params }: PageProps<"/tournaments/[id]">): Promise<Metadata> {
  const t = await load(params);
  if (!t) return {};
  const description = [TOUR_LABEL[t.tour], t.category, dateRange(t.startDate, t.endDate), t.champion ? `Champion: ${t.champion.name}` : null]
    .filter(Boolean)
    .join(" · ");
  return { title: displayName(t.name), description };
}

export default async function TournamentPage({ params }: PageProps<"/tournaments/[id]">) {
  const t = await load(params);
  if (!t) notFound();
  const { matchups } = await getUpcoming(new Date(), { cached: true, tournamentId: t.id });

  const facts = [TOUR_LABEL[t.tour], t.category, t.location ? displayName(t.location.split(",")[0]) : null, t.surface, t.drawSize ? `${t.drawSize}-player draw` : null].filter(Boolean);

  return (
    <article className="space-y-6">
      <Link href="/tournaments" className="text-sm text-muted hover:text-foreground">
        ← Tournaments
      </Link>

      <header className="space-y-1">
        <p className="text-sm font-medium text-accent">{dateRange(t.startDate, t.endDate)}</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{displayName(t.name)}</h1>
        <p className="text-sm text-muted">{facts.join(" · ")}</p>
      </header>

      {t.champion && (
        <div className="inline-flex items-center gap-3 rounded-xl border border-accent/50 bg-accent-soft px-4 py-3">
          <span aria-hidden className="text-xl">🏆</span>
          <span>
            <span className="block text-xs text-muted">Champion</span>
            {t.champion.id !== null ? (
              <Link href={`/players/${t.champion.id}`} className="font-semibold hover:underline">
                {t.champion.name}
              </Link>
            ) : (
              <span className="font-semibold">{t.champion.name}</span>
            )}
          </span>
        </div>
      )}

      {matchups.length > 0 && (
        <section aria-labelledby="next-heading" className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 id="next-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Up next
            </h2>
            <Link href="/odds" className="text-xs font-medium text-accent hover:underline">
              Odds →
            </Link>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {matchups.map((m) => (
              <MatchupRow key={m.id} m={m} />
            ))}
          </ul>
          <p className="text-xs text-muted">Win chances from our model: estimates, not betting advice.</p>
        </section>
      )}

      {t.rounds.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
          No results yet. Finished matches appear here once the draw is updated.
        </p>
      ) : (
        <section aria-labelledby="draw-heading" className="space-y-3">
          <h2 id="draw-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Results by round
          </h2>
          {/* Rounds side by side like a bracket; this strip scrolls on its own, the page never does. */}
          <div className="-mx-4 overflow-x-auto px-4 pb-2">
            <div className="flex gap-4" style={{ minWidth: "min-content" }}>
              {t.rounds.map((r) => (
                <section key={r.round} aria-label={r.round} className="w-80 shrink-0 space-y-2">
                  <h3 className="sticky top-0 text-sm font-semibold">
                    {r.round} <span className="font-normal text-muted">· {r.matches.length}</span>
                  </h3>
                  <ul className="space-y-2">
                    {r.matches.map((m) => (
                      <li key={m.id}>
                        <MatchCard match={m} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
          <WikiCredit sources={t.sources} />
        </section>
      )}
    </article>
  );
}
