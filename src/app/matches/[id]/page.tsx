import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Flag } from "@/components/flag";
import { MarketHistory } from "@/components/market-history";
import { MatchCard } from "@/components/match-card";
import { StartParty } from "@/components/party/start-party";
import { WikiCredit } from "@/components/wiki-credit";
import { getMatchPreview, type PreviewSide } from "@/lib/data/match-preview";
import { titleFromUrl } from "@/lib/data/results";
import { displayName } from "@/lib/data/tournaments";
import { TOUR_LABEL } from "@/lib/format";
import { formatAmerican } from "@/lib/model/odds";

export const revalidate = 900;

export function generateStaticParams() {
  return [];
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

async function load(params: PageProps<"/matches/[id]">["params"]) {
  const { id } = await params;
  return /^\d+$/.test(id) ? getMatchPreview(Number(id)) : null;
}

export async function generateMetadata({ params }: PageProps<"/matches/[id]">): Promise<Metadata> {
  const m = await load(params);
  if (!m) return {};
  const vs = `${m.a.name} vs ${m.b.name}`;
  const where = `${displayName(m.match.tournament.name)}${m.match.round ? `, ${m.match.round}` : ""}`;
  const title = m.scheduled ? `${vs} prediction` : `${vs} result`;
  const description = m.scheduled
    ? `${where}: ${m.chanceA !== null ? `${m.a.name} ${pct(m.chanceA)}, ${m.b.name} ${pct(1 - m.chanceA)} by our model. ` : ""}Head-to-head, form and title stakes.`
    : `${where}: result, pre-match chances and head-to-head.`;
  return { title, description, openGraph: { title, description } };
}

function Side({ s, chance, align }: { s: PreviewSide; chance: number | null; align: "left" | "right" }) {
  return (
    <div className={`flex flex-1 flex-col gap-1 ${align === "right" ? "items-end text-right" : "items-start"}`}>
      <span className="flex items-center gap-1.5 text-lg font-semibold sm:text-xl">
        {align === "left" && <Flag code={s.countryCode} />}
        {s.id !== null ? (
          <Link href={`/players/${s.id}`} className="hover:underline">
            {s.name}
          </Link>
        ) : (
          s.name
        )}
        {align === "right" && <Flag code={s.countryCode} />}
      </span>
      <span className="text-xs text-muted">
        {[s.rank ? `#${s.rank}` : "Outside top 100", s.rating ? `rating ${s.rating}` : null].filter(Boolean).join(" · ")}
      </span>
      {chance !== null && <span className="text-4xl font-semibold tabular-nums text-accent">{pct(chance)}</span>}
    </div>
  );
}

function Form({ s }: { s: PreviewSide }) {
  if (!s.form) return <p className="text-sm text-muted">No profile to show form for.</p>;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{s.name}</p>
      <p className="text-xs text-muted">
        Season {s.form.w}–{s.form.l}
      </p>
      <p className="flex gap-1" aria-label={`Last ${s.form.recent.length} results: ${s.form.recent.join(" ")}`}>
        {s.form.recent.map((r, i) => (
          <span
            key={i}
            aria-hidden
            className={`inline-flex size-6 items-center justify-center rounded text-[11px] font-semibold ${r === "W" ? "bg-accent-soft text-accent" : "bg-surface-muted text-muted"}`}
          >
            {r}
          </span>
        ))}
      </p>
    </div>
  );
}

export default async function MatchPage({ params }: PageProps<"/matches/[id]">) {
  const m = await load(params);
  if (!m) notFound();
  const { a, b, match } = m;
  const facts = [TOUR_LABEL[m.tour], m.category, m.surface, match.round].filter(Boolean);
  const upset = !m.scheduled && m.chanceA !== null && match.winner !== null && (match.winner === 1 ? m.chanceA : 1 - m.chanceA) < 0.35;
  const source = match.provider === "wikipedia" && match.sourceUrl ? [{ title: titleFromUrl(match.sourceUrl), url: match.sourceUrl }] : [];

  return (
    <article className="space-y-6">
      <Link href={`/tournaments/${match.tournament.id}`} className="text-sm text-muted hover:text-foreground">
        ← {displayName(match.tournament.name)}
      </Link>
      <header className="space-y-1">
        <p className="text-sm font-medium text-accent">{m.scheduled ? "Match preview" : "Result"}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {a.name} vs {b.name}
        </h1>
        <p className="text-sm text-muted">{facts.join(" · ")}</p>
      </header>

      <section aria-label="Win chances" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <Side s={a} chance={m.chanceA} align="left" />
          <span className="pt-1 text-sm text-muted">vs</span>
          <Side s={b} chance={m.chanceA === null ? null : 1 - m.chanceA} align="right" />
        </div>
        {m.chanceA !== null && (
          <>
            <div aria-hidden className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-muted">
              <span className="bg-chart-line" style={{ width: `${m.chanceA * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {m.scheduled ? "Our model’s chances today" : "Our model’s chances before the match"}
              {m.surface ? ` on ${m.surface.toLowerCase()}` : ""}. Estimates, not betting advice.
            </p>
          </>
        )}
        {!m.scheduled && (
          <div className="mt-4">
            <MatchCard match={match} />
            {upset && <p className="mt-2 text-sm font-medium text-accent">Upset: the winner had a {pct(match.winner === 1 ? m.chanceA! : 1 - m.chanceA!)} chance.</p>}
          </div>
        )}
      </section>

      {match.status !== "final" && <StartParty matchId={match.id} />}
      {match.status === "final" && !match.resultDetail && match.sets.length > 0 && (
        <p className="text-sm">
          <Link href={`/party/demo?match=${match.id}`} className="font-medium text-accent hover:underline">
            Replay this match as a watch party →
          </Link>{" "}
          <span className="text-muted">Point-by-point demo with win chances, calls and chat.</span>
        </p>
      )}

      {m.recap && (
        <section aria-labelledby="recap-heading" className="space-y-2">
          <h2 id="recap-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Recap
          </h2>
          <div className="rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed">
            <p>{m.recap.body}</p>
            <p className="mt-2 text-xs text-muted">Written by AI (Claude) from the facts on this page. It can make mistakes.</p>
          </div>
        </section>
      )}

      {(a.title || b.title) && (
        <section aria-labelledby="stakes-heading" className="space-y-2">
          <h2 id="stakes-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            What’s at stake
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[a, b].map((s) =>
              s.title ? (
                <li key={s.key} className="rounded-xl border border-border bg-surface p-4 text-sm">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-muted">
                    Title chance {pct(s.title.now)} now, <span className="font-semibold text-foreground">{pct(s.title.ifWin)}</span> with a win.
                  </p>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}

      {m.scheduled && m.bySurface.length > 0 && (
        <section aria-labelledby="surface-heading" className="space-y-2">
          <h2 id="surface-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            By surface
          </h2>
          <ul className="overflow-hidden rounded-xl border border-border bg-surface text-sm">
            {m.bySurface.map((s) => (
              <li key={s.surface} className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0">
                <span className="w-14">{s.surface}</span>
                <span className="w-10 text-right font-semibold tabular-nums">{pct(s.p)}</span>
                <span aria-hidden className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <span className="bg-chart-line" style={{ width: `${s.p * 100}%` }} />
                </span>
                <span className="w-10 tabular-nums">{pct(1 - s.p)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {m.market && m.market.books > 0 && (
        <section aria-labelledby="odds-heading" className="space-y-2">
          <h2 id="odds-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Bookmaker odds
          </h2>
          <p className="rounded-xl border border-border bg-surface p-4 text-sm">
            Best prices: {a.name} {m.market.best1 ? `${formatAmerican(m.market.best1.american)} (${m.market.best1.vendor})` : "–"}, {b.name}{" "}
            {m.market.best2 ? `${formatAmerican(m.market.best2.american)} (${m.market.best2.vendor})` : "–"}.
            {m.market.fair1 !== null && ` The market gives ${a.name} ${pct(m.market.fair1)} once the margin is removed.`} 18+. Betting
            carries risk.
          </p>
          {m.marketHistory.length >= 2 && <MarketHistory points={m.marketHistory} name={a.name} model={m.chanceA} />}
        </section>
      )}

      <section aria-labelledby="form-heading" className="space-y-2">
        <h2 id="form-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Form
        </h2>
        <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
          <Form s={a} />
          <Form s={b} />
        </div>
      </section>

      {m.h2h && (
        <section aria-labelledby="h2h-heading" className="space-y-2">
          <h2 id="h2h-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Head-to-head
          </h2>
          <p className="rounded-xl border border-border bg-surface p-4 text-sm">
            {m.h2h.winsA + m.h2h.winsB === 0 ? (
              "No tracked meetings yet."
            ) : m.h2h.winsA === m.h2h.winsB ? (
              <>
                Level at <span className="font-semibold tabular-nums">{`${m.h2h.winsA}–${m.h2h.winsB}`}</span>.
              </>
            ) : (
              <>
                {m.h2h.winsA > m.h2h.winsB ? a.name : b.name} leads{" "}
                <span className="font-semibold tabular-nums">{`${Math.max(m.h2h.winsA, m.h2h.winsB)}–${Math.min(m.h2h.winsA, m.h2h.winsB)}`}</span>.
              </>
            )}{" "}
            <Link href={`/h2h?a=${a.id}&b=${b.id}`} className="font-medium text-accent hover:underline">
              Every meeting →
            </Link>
          </p>
        </section>
      )}

      <WikiCredit sources={source} />
    </article>
  );
}
