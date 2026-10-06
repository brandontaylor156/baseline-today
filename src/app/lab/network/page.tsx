import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { isTour, TOUR_LABEL } from "@/lib/format";
import { winChain, type Win } from "@/lib/lab/network";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import type { ChainCache, NetworkCache } from "@/lib/sync/network";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "The win network",
  description:
    "Every result as a link from loser to winner: prestige rankings by PageRank, an honest test against the ratings, and a finder for the chain of real wins between any two players.",
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default async function NetworkPage({ searchParams }: PageProps<"/lab/network">) {
  const q = await searchParams;
  const tour: Tour = typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const db = createPublicClient();
  const [{ data: net }, { data: ch }] = await Promise.all([
    db.from("stat_cache").select("data").eq("key", "lab:network").maybeSingle(),
    db.from("stat_cache").select("data").eq("key", "lab:chains").maybeSingle(),
  ]);
  const d = net?.data as unknown as NetworkCache | undefined;
  const c = ch?.data as unknown as ChainCache | undefined;
  const t = d?.tours[tour];

  // The chain finder: real wins between players with profiles.
  const from = typeof q.from === "string" && /^\d+$/.test(q.from) ? q.from : (t?.prestige.at(-1)?.id?.toString() ?? null);
  const to = typeof q.to === "string" && /^\d+$/.test(q.to) ? q.to : (t?.prestige[0]?.id?.toString() ?? null);
  const wins: Win[] = (c?.edges ?? []).map(([w, l, m]) => ({ winner: String(w), loser: String(l), matchId: m }));
  const chain = from && to && c ? winChain(wins, from, to) : null;
  const people = c ? Object.entries(c.names).sort((a, b) => a[1].localeCompare(b[1])) : [];
  const name = (id: string) => c?.names[id] ?? id;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <Link href="/lab" className="text-sm text-muted hover:text-foreground">
            ← Research lab
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">The win network</h1>
          <p className="text-sm text-muted">
            Every result as a link from the loser to the winner. Beating players who beat good players counts for more (PageRank, the
            idea Radicchi applied to tennis in 2011). And any two players are joined by chains of real wins.
          </p>
        </div>
        <nav aria-label="Tour" className="flex overflow-hidden rounded-lg border border-border text-sm">
          {(["atp", "wta"] as const).map((x) => (
            <Link key={x} href={`/lab/network?tour=${x}`} aria-current={x === tour ? "page" : undefined} className={`px-3 py-1.5 ${x === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {TOUR_LABEL[x]}
            </Link>
          ))}
        </nav>
      </div>

      {!t || !c ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Computed weekly; check back soon.</p>
      ) : (
        <>
          <section aria-labelledby="chain-heading" className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
            <h2 id="chain-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              The chain of wins
            </h2>
            <form action="/lab/network" className="flex flex-wrap items-end gap-2 text-sm">
              <input type="hidden" name="tour" value={tour} />
              {[
                { label: "From", field: "from", value: from },
                { label: "To", field: "to", value: to },
              ].map((f) => (
                <label key={f.field} className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">{f.label}</span>
                  <select name={f.field} defaultValue={f.value ?? ""} className="min-h-11 max-w-full rounded-lg border border-border bg-surface px-3 py-2">
                    {people.map(([id, n]) => (
                      <option key={id} value={id}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button type="submit" className="min-h-11 rounded-lg border border-border px-4 py-2 font-medium hover:bg-surface-muted">
                Find
              </button>
            </form>
            {from && to && (
              <div className="text-sm">
                {chain === null ? (
                  <p className="text-muted">
                    No chain of six wins or fewer from {name(from)} to {name(to)} among players with profiles.
                  </p>
                ) : chain.length === 0 ? (
                  <p className="text-muted">Pick two different players.</p>
                ) : (
                  <ol className="space-y-1">
                    {chain.map((w, i) => (
                      <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className="text-xs text-muted tabular-nums">{i + 1}.</span>
                        <Link href={`/players/${w.winner}`} className="font-medium hover:underline">
                          {name(w.winner)}
                        </Link>
                        <Link href={`/matches/${w.matchId}`} className="text-muted underline hover:text-foreground">
                          beat
                        </Link>
                        <Link href={`/players/${w.loser}`} className="font-medium hover:underline">
                          {name(w.loser)}
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-2 text-xs text-muted">Each “beat” links to the real match: the latest time one beat the other.</p>
              </div>
            )}
          </section>

          <section aria-labelledby="prestige-heading" className="space-y-2">
            <h2 id="prestige-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Prestige, last 52 weeks
            </h2>
            <ol className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
              {t.prestige.slice(0, 20).map((p, i) => (
                <li key={p.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="w-6 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                    <Flag code={p.country} reserve />
                    {p.id ? (
                      <Link href={`/players/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    ) : (
                      <span>{p.name}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-muted tabular-nums">{p.wins} wins</span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="test-heading" className="max-w-2xl space-y-2 text-sm">
            <h2 id="test-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Does prestige predict?
            </h2>
            <p>
              Picking the winner of every match from 2017 on using the previous 52 weeks ({t.test.matches.toLocaleString("en-US")} matches):
              prestige picks {pct(t.test.pageRank)}, simply counting wins picks {pct(t.test.winCount)}, and the rating model picks{" "}
              <strong>{pct(t.test.model)}</strong>.
            </p>
            <p className="text-muted">
              Prestige barely beats counting wins and trails the ratings, as Zhou and colleagues found for PageRank in sport (2020): it
              helps most when few matches have been played. A nice story, not a better forecast.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
