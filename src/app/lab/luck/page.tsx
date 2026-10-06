import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { getLuck, getTitleExtremes, type LuckRow } from "@/lib/data/lab";
import { isTour, TOUR_LABEL } from "@/lib/format";
import { createPublicClient } from "@/lib/supabase/public";
import type { Tour } from "@/lib/provider/types";

export const revalidate = 3600;

export async function generateMetadata({ searchParams }: PageProps<"/lab/luck">): Promise<Metadata> {
  const { tour } = await searchParams;
  const t: Tour = typeof tour === "string" && isTour(tour) ? tour : "atp";
  return {
    title: `${TOUR_LABEL[t]} titles: expected vs actual`,
    description: `Every ${TOUR_LABEL[t]} draw since 2015 rebuilt and replayed: each player's expected titles from their pre-tournament chances, against the titles they won. Plus the most improbable champions.`,
  };
}

const odds = (p: number) => (p >= 0.1 ? `${Math.round(p * 100)}%` : p >= 0.001 ? `${(p * 100).toFixed(1)}%` : `1 in ${Math.round(1 / Math.max(p, 1e-7)).toLocaleString("en-US")}`);

function Who({ id, name, country }: { id: number | null; name: string; country: string | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
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

function LuckTable({ title, note, rows }: { title: string; note: string; rows: LuckRow[] }) {
  return (
    <section aria-labelledby={`t-${title}`} className="space-y-2">
      <h2 id={`t-${title}`} className="text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      <p className="text-xs text-muted">{note}</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">{title}</caption>
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Player</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Expected</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Won</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Difference</th>
              <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Draws</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const d = r.titles - r.expected;
              return (
                <tr key={r.id}>
                  <th scope="row" className="max-w-0 px-3 py-2 text-left font-normal sm:max-w-none">
                    <Who {...r} />
                  </th>
                  <td className="px-2 py-2 text-right">{r.expected.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right font-semibold">{r.titles}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${d > 0 ? "text-up" : d < 0 ? "text-down" : ""}`}>
                    {d > 0 ? "+" : d < 0 ? "−" : ""}
                    {Math.abs(d).toFixed(1)}
                  </td>
                  <td className="hidden px-3 py-2 text-right text-muted sm:table-cell">{r.entries}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function LuckPage({ searchParams }: PageProps<"/lab/luck">) {
  const { tour: q } = await searchParams;
  const tour: Tour = typeof q === "string" && isTour(q) ? q : "atp";
  const db = createPublicClient();
  const [luck, longshots, busts, { data: easy }, { data: hard }] = await Promise.all([
    getLuck(tour),
    getTitleExtremes(tour, true, 12),
    getTitleExtremes(tour, false, 12),
    db.rpc("lab_draw_luck", { p_tour: tour, p_easiest: true, p_limit: 10 }),
    db.rpc("lab_draw_luck", { p_tour: tour, p_easiest: false, p_limit: 10 }),
  ]);
  const byExpected = [...luck].sort((a, b) => b.expected - a.expected).slice(0, 15);
  const over = [...luck].filter((r) => r.expected >= 1 || r.titles >= 2).sort((a, b) => b.titles - b.expected - (a.titles - a.expected)).slice(0, 10);
  const under = [...luck].filter((r) => r.expected >= 1).sort((a, b) => a.titles - a.expected - (b.titles - b.expected)).slice(0, 10);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <Link href="/lab" className="text-sm text-muted hover:text-foreground">
            ← Research lab
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{TOUR_LABEL[tour]} titles: expected vs actual</h1>
          <p className="text-sm text-muted">
            We rebuilt every tracked draw since 2015 from its results, then worked out each player’s exact chance of winning it before
            the first ball, from the ratings they had that week. Add those chances up and you get the titles a player “should” have
            won.
          </p>
        </div>
        <nav aria-label="Tour" className="flex overflow-hidden rounded-lg border border-border text-sm">
          {(["atp", "wta"] as const).map((t) => (
            <Link key={t} href={`/lab/luck?tour=${t}`} aria-current={t === tour ? "page" : undefined} className={`px-3 py-1.5 ${t === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {TOUR_LABEL[t]}
            </Link>
          ))}
        </nav>
      </div>

      <LuckTable title="Most expected titles" note="Who the draws favoured most, and what they made of it." rows={byExpected} />
      <div className="grid gap-6 lg:grid-cols-2">
        <LuckTable
          title="Won more than expected"
          note="Clutch, or better than their rating said. Fast-rising players appear here partly because ratings trail real improvement."
          rows={over}
        />
        <LuckTable title="Won fewer than expected" note="Favoured often, converted less (at least one expected title)." rows={under} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="longshots-heading" className="space-y-2">
          <h2 id="longshots-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Most improbable champions
          </h2>
          <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
            {longshots.map((r) => (
              <li key={`${r.tournamentId}`} className="flex items-baseline gap-3 px-4 py-2.5">
                <span className="w-24 shrink-0 font-semibold tabular-nums text-accent">{odds(r.chance)}</span>
                <span className="min-w-0 flex-1">
                  <Who {...r} />
                  <Link href={`/tournaments/${r.tournamentId}`} className="mt-1.5 block truncate text-xs text-muted hover:underline">
                    {r.tournament} {r.season}
                  </Link>
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="busts-heading" className="space-y-2">
          <h2 id="busts-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Biggest favourites who didn’t win
          </h2>
          <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
            {busts.map((r) => (
              <li key={`${r.tournamentId}-${r.name}`} className="flex items-baseline gap-3 px-4 py-2.5">
                <span className="w-24 shrink-0 font-semibold tabular-nums">{odds(r.chance)}</span>
                <span className="min-w-0 flex-1">
                  <Who {...r} />
                  <Link href={`/tournaments/${r.tournamentId}`} className="mt-1.5 block truncate text-xs text-muted hover:underline">
                    {r.tournament} {r.season}
                  </Link>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {(
          [
            ["Easiest paths to a title", easy, "Upsets elsewhere cleared the way: the opponents they actually met were much easier than the draw promised."],
            ["Hardest paths to a title", hard, "They had to beat the best: the opponents they met were tougher than the draw’s average path."],
          ] as const
        ).map(([title, rows, note]) => (
          <section key={title} aria-label={title} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
            <p className="text-xs text-muted">{note} 500-level events and above.</p>
            <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
              {(rows ?? []).map((r) => (
                <li key={r.tournament_id} className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="w-14 shrink-0 font-semibold tabular-nums">{(r.path_chance / r.chance).toFixed(1)}×</span>
                  <span className="min-w-0 flex-1">
                    <Who id={r.player_id} name={r.name} country={r.country} />
                    <Link href={`/tournaments/${r.tournament_id}`} className="mt-1.5 block truncate text-xs text-muted hover:underline">
                      {r.tournament} {r.season} · title chance {odds(r.chance)}, actual path {odds(r.path_chance)}
                    </Link>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <p className="text-xs text-muted">
        Chances use the site’s calibrated, surface-aware Elo model (best of five for men’s Grand Slams). Only draws we could rebuild
        completely from Wikipedia results are counted (about 95%), so totals can be lower than official careers. Recomputed weekly.
      </p>
    </div>
  );
}
