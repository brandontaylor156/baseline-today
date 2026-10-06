import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { isTour, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import type { DeservedRow, PythagoreanCache } from "@/lib/sync/pythagorean";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "The deserved record",
  description:
    "Tennis's Pythagorean record: the wins a player's share of games deserved, this season's luckiest and unluckiest records, and whether games or wins predict next season better.",
};

const signed = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}`;

function Table({ rows, caption }: { rows: DeservedRow[]; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Player</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Record</th>
            <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Games won</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Deserved</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Gap</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="px-3 py-2 text-left font-normal">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Flag code={r.country} reserve />
                  {r.id ? (
                    <Link href={`/players/${r.id}`} className="hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    <span>{r.name}</span>
                  )}
                </span>
              </th>
              <td className="whitespace-nowrap px-2 py-2 text-right">
                {r.wins}–{r.matches - r.wins}
              </td>
              <td className="hidden px-2 py-2 text-right text-muted sm:table-cell">{(r.gameShare * 100).toFixed(1)}%</td>
              <td className="px-2 py-2 text-right text-muted">{r.deserved.toFixed(1)}</td>
              <td className={`px-3 py-2 text-right font-semibold ${r.gap > 0 ? "text-up" : "text-down"}`}>{signed(r.gap)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function DeservedPage({ searchParams }: PageProps<"/lab/deserved">) {
  const q = await searchParams;
  const tour: Tour = typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const { data: row } = await createPublicClient().from("stat_cache").select("data").eq("key", "lab:pythagorean").maybeSingle();
  const d = row?.data as unknown as PythagoreanCache | undefined;
  const t = d?.tours[tour];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <Link href="/lab" className="text-sm text-muted hover:text-foreground">
            ← Research lab
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">The deserved record</h1>
          <p className="text-sm text-muted">
            Win the close matches and the record flatters you; lose them and it doesn’t. A season’s share of games won says how well a
            player actually played. From every real result since 2016 we fit how game share turns into match wins (tennis’s version of
            baseball’s Pythagorean record), then compare each record with what its games deserved.
          </p>
        </div>
        <nav aria-label="Tour" className="flex overflow-hidden rounded-lg border border-border text-sm">
          {(["atp", "wta"] as const).map((x) => (
            <Link key={x} href={`/lab/deserved?tour=${x}`} aria-current={x === tour ? "page" : undefined} className={`px-3 py-1.5 ${x === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {TOUR_LABEL[x]}
            </Link>
          ))}
        </nav>
      </div>

      {!d || !t ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Computed weekly; check back soon.</p>
      ) : (
        <>
          <section aria-labelledby="test-heading" className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm sm:p-5">
            <h2 id="test-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Which predicts next season: wins or games?
            </h2>
            <p>
              Over {t.test.pairs} consecutive {TOUR_LABEL[tour]} seasons (20+ matches each), next season’s win rate correlates{" "}
              <strong>{t.test.fromGames.toFixed(3)}</strong> with this season’s deserved record and {t.test.fromRecord.toFixed(3)} with the
              actual record. {t.test.fromGames > t.test.fromRecord ? "Games are the better guide." : "The record is as good a guide here."}
            </p>
            <p>
              Does the luck itself carry over? The gap between record and deserved record correlates {t.test.luckCarries.toFixed(2)} from
              one season to the next.{" "}
              {t.test.luckCarries > 0.1
                ? "A little of it does, which suggests a small real skill in winning close matches, on top of plenty of luck."
                : "It doesn’t: close-match luck evens out."}
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="lucky-heading" className="space-y-2">
              <h2 id="lucky-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
                Most wins above their games, {d.season}
              </h2>
              <Table rows={t.lucky.slice(0, 10)} caption={`Players with the most wins above what their games deserved, ${d.season}`} />
            </section>
            <section aria-labelledby="unlucky-heading" className="space-y-2">
              <h2 id="unlucky-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
                Most wins below their games, {d.season}
              </h2>
              <Table rows={t.unlucky.slice(0, 10)} caption={`Players with the most wins below what their games deserved, ${d.season}`} />
            </section>
          </div>

          <p className="text-xs text-muted">
            Deserved: matches × the win share their game share implies, from logit(wins) = {t.k.toFixed(2)} × logit(games), fitted on every
            player-season since 2016 (after Kovalchik, Journal of Quantitative Analysis in Sports, 2016). Players with 20+ tracked matches
            this season; walkovers left out. Updated weekly.
          </p>
        </>
      )}
    </div>
  );
}
