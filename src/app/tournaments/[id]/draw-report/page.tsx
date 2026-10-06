import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Flag } from "@/components/flag";
import { getDrawModel } from "@/lib/data/title-odds";
import { displayName, getTournament } from "@/lib/data/tournaments";
import { drawReport, type ReportPlayer } from "@/lib/draw-report";
import { roundName } from "@/lib/draw-model";
import { TOUR_LABEL } from "@/lib/format";

export const revalidate = 3600;

const pct = (p: number) => (p >= 0.995 ? "99%+" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);
const QUARTER = ["Top quarter", "Second quarter", "Third quarter", "Bottom quarter"];

async function load(params: PageProps<"/tournaments/[id]/draw-report">["params"]) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return null;
  const [t, model] = await Promise.all([getTournament(Number(id)), getDrawModel(Number(id))]);
  return t && model ? { t, model } : null;
}

export async function generateMetadata({ params }: PageProps<"/tournaments/[id]/draw-report">): Promise<Metadata> {
  const x = await load(params);
  if (!x) return {};
  const name = `${displayName(x.t.name)} ${x.t.startDate?.slice(0, 4) ?? ""}`.trim();
  return {
    title: `${name} draw analysis`,
    description: `The ${name} draw, analysed: each quarter, the quarter of death, every seed's draw luck against random draws, the likeliest quarterfinals and final, and the dark horses.`,
  };
}

function Name({ p }: { p: ReportPlayer }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Flag code={p.countryCode} reserve />
      {p.id ? (
        <Link href={`/players/${p.id}`} className="hover:underline">
          {p.name}
        </Link>
      ) : (
        <span>{p.name}</span>
      )}
      {p.seed && <span className="text-xs text-muted">({p.seed})</span>}
    </span>
  );
}

export default async function DrawReportPage({ params }: PageProps<"/tournaments/[id]/draw-report">) {
  const x = await load(params);
  if (!x) notFound();
  const { t, model } = x;
  const r = drawReport(model, 200);
  const R = r.rounds;
  const death = [...r.quarters].sort((a, b) => b.rivalShare - a.rivalShare)[0];
  const open = [...r.quarters].sort((a, b) => a.favouriteChance - b.favouriteChance)[0];
  const lucky = [...r.luck].sort((a, b) => b.semi - b.semiAverage - (a.semi - a.semiAverage));
  const name = `${displayName(t.name)} ${t.startDate?.slice(0, 4) ?? ""}`.trim();

  return (
    <article className="space-y-8">
      <div className="max-w-2xl">
        <Link href={`/tournaments/${t.id}`} className="text-sm text-muted hover:text-foreground">
          ← {displayName(t.name)}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{name}: the draw, analysed</h1>
        <p className="text-sm text-muted">
          {[TOUR_LABEL[t.tour], t.category, t.surface].filter(Boolean).join(" · ")}. From the draw as made, before the first match, with
          the model’s ratings. Draw luck compares each seed’s chances here with the average over {r.draws} random draws made with the
          same seeding rules.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <dt className="text-xs text-muted">Favourite</dt>
          <dd className="mt-1 font-semibold">
            <Name p={r.players[0]} />
          </dd>
          <dd className="text-sm text-muted">{pct(r.players[0].reach[R])} to win the title</dd>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <dt className="text-xs text-muted">Quarter of death</dt>
          <dd className="mt-1 font-semibold">{QUARTER[death.index]}</dd>
          <dd className="text-sm text-muted">{pct(death.rivalShare)} of the title chances sit with players other than its favourite</dd>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <dt className="text-xs text-muted">Luckiest draw</dt>
          <dd className="mt-1 font-semibold">{lucky[0] ? <Name p={lucky[0].player} /> : "–"}</dd>
          <dd className="text-sm text-muted">{lucky[0] ? `${pct(lucky[0].semi)} to reach the semis here vs ${pct(lucky[0].semiAverage)} in an average draw` : ""}</dd>
        </div>
      </dl>

      <section aria-labelledby="quarters-heading" className="space-y-3">
        <h2 id="quarters-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Quarter by quarter
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {r.quarters.map((q) => (
            <div key={q.index} className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
              <h3 className="flex items-baseline justify-between gap-2 font-semibold">
                {QUARTER[q.index]}
                <span className="text-xs font-normal text-muted">
                  {q.index === death.index ? "Quarter of death" : q.index === open.index ? "Most open" : ""}
                </span>
              </h3>
              <p>
                Favourite <Name p={q.favourite} />: {pct(q.favouriteChance)} to reach the semifinals.
              </p>
              <p className="text-muted">
                Seeds: {q.seeds.length ? q.seeds.map((s) => `${s.name.split(" ").at(-1)} (${s.seed})`).join(", ") : "none"}. Title chances in this
                quarter: {pct(q.titleShare)}.
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="luck-heading" className="space-y-2">
        <h2 id="luck-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Draw luck, seed by seed
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">Each seed’s title and semifinal chances in this draw and in an average draw</caption>
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Seed</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Semifinal</th>
                <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Average draw</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Title</th>
                <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Average draw</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Luck</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.luck.slice(0, 16).map((l) => {
                const d = l.semi - l.semiAverage;
                return (
                  <tr key={l.player.key}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <Name p={l.player} />
                    </th>
                    <td className="px-2 py-2 text-right">{pct(l.semi)}</td>
                    <td className="hidden px-2 py-2 text-right text-muted sm:table-cell">{pct(l.semiAverage)}</td>
                    <td className="px-2 py-2 text-right">{pct(l.title)}</td>
                    <td className="hidden px-2 py-2 text-right text-muted sm:table-cell">{pct(l.titleAverage)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${Math.abs(d) < 0.02 ? "" : d > 0 ? "text-up" : "text-down"}`}>
                      {d >= 0 ? "+" : "−"}
                      {Math.abs(Math.round(d * 100))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">Luck: semifinal chance here minus in an average draw, in percentage points.</p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {[
          { title: `Likeliest ${roundName(R - 2, R).toLowerCase()}`, rows: r.quarterfinals },
          { title: "Likeliest finals", rows: r.finals },
        ].map((s) => (
          <section key={s.title} aria-label={s.title} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{s.title}</h2>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
              {s.rows.map((m) => (
                <li key={`${m.a.key}-${m.b.key}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <Name p={m.a} /> <span className="text-muted">v</span> <Name p={m.b} />
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{pct(m.p)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {r.darkHorses.length > 0 && (
        <section aria-labelledby="horses-heading" className="space-y-2">
          <h2 id="horses-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Dark horses
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {r.darkHorses.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-3 px-3 py-2">
                <Name p={p} />
                <span className="shrink-0 text-muted tabular-nums">
                  <strong className="text-foreground">{pct(p.reach[R - 2])}</strong> to reach the semis · {pct(p.reach[R])} title
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted">
        From the bracket on Wikipedia and the model’s ratings at the start of the event; results since then are ignored here (the
        tournament page has the live chances). Estimates, not betting advice.
      </p>
    </article>
  );
}
