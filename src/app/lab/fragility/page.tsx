import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { isTour, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import type { FragileRow, FragilityCache } from "@/lib/sync/fragility";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Fragile favourites: trait or myth?",
  description:
    "Do some tennis players keep letting matches they should win drift into deciding sets, and does it predict upsets? Measured against the scoreline model on every match since 2016.",
};

const signed = (x: number, d = 0) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}`;

function Table({ rows, caption }: { rows: FragileRow[]; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Player</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Deciding sets</th>
            <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Expected</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Wins / expected</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => (
            <tr key={p.key}>
              <th scope="row" className="px-3 py-2 text-left font-normal">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Flag code={p.country} reserve />
                  {p.id ? (
                    <Link href={`/players/${p.id}`} className="hover:underline">
                      {p.name}
                    </Link>
                  ) : (
                    <span>{p.name}</span>
                  )}
                </span>
              </th>
              <td className="px-2 py-2 text-right">
                {p.deciders} <span className="text-xs text-muted">of {p.matches}</span>
              </td>
              <td className="hidden px-2 py-2 text-right text-muted sm:table-cell">{p.expected.toFixed(1)}</td>
              <td className="px-3 py-2 text-right">
                {p.wins} / {p.expectedWins.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function FragilityPage({ searchParams }: PageProps<"/lab/fragility">) {
  const q = await searchParams;
  const tour: Tour = typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const { data: row } = await createPublicClient().from("stat_cache").select("data").eq("key", "lab:fragility").maybeSingle();
  const d = row?.data as unknown as FragilityCache | undefined;
  const t = d?.tours[tour];
  const atp = d?.tours.atp;
  const wta = d?.tours.wta;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <Link href="/lab" className="text-sm text-muted hover:text-foreground">
            ← Research lab
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Fragile favourites: trait or myth?</h1>
          <p className="text-sm text-muted">
            Some favourites seem to let every match drift into a deciding set; others close out ruthlessly. The{" "}
            <Link href="/lab/scorelines" className="underline hover:text-foreground">
              scoreline model
            </Link>{" "}
            says how often a favoured match should go the distance, so we can measure it, and then ask whether it means anything.
          </p>
        </div>
        <nav aria-label="Tour" className="flex overflow-hidden rounded-lg border border-border text-sm">
          {(["atp", "wta"] as const).map((x) => (
            <Link key={x} href={`/lab/fragility?tour=${x}`} aria-current={x === tour ? "page" : undefined} className={`px-3 py-1.5 ${x === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {TOUR_LABEL[x]}
            </Link>
          ))}
        </nav>
      </div>

      {!t || !atp || !wta ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Computed weekly; check back soon.</p>
      ) : (
        <>
          <section aria-labelledby="verdict-heading" className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
            <h2 id="verdict-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              The verdict: a myth
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>
                <strong>It doesn’t last.</strong> How fragile a player was as favourite in 2016–2020 tells you nothing about 2021 on: the
                correlation is {atp.persistence.r.toFixed(2)} on the ATP ({atp.persistence.players} players) and {wta.persistence.r.toFixed(2)}{" "}
                on the WTA ({wta.persistence.players} players). A real trait would carry over.
              </li>
              <li>
                <strong>It doesn’t predict upsets.</strong> Scoring every match with each player’s fragility from earlier seasons only, a
                fragile favourite is worth {signed(atp.effect.points)} rating points on the ATP (95%: {signed(atp.effect.low)} to{" "}
                {signed(atp.effect.high)}) and {signed(wta.effect.points)} on the WTA ({signed(wta.effect.low)} to {signed(wta.effect.high)}
                ): both intervals include zero, and adding it makes predictions for 2023 on slightly worse, not better.
              </li>
              <li>
                <strong>The lists below are what chance looks like.</strong> Among {t.pool} players with 25 or more favoured matches in two
                years, a handful will sit two or three standard deviations from expectation by luck alone. That is roughly what we see.
              </li>
            </ul>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="fragile-heading" className="space-y-2">
              <h2 id="fragile-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
                Most deciding sets as favourite
              </h2>
              <Table rows={t.fragile.slice(0, 10)} caption="Players whose favoured matches went to a deciding set most often against expectation, last two years" />
            </section>
            <section aria-labelledby="ruthless-heading" className="space-y-2">
              <h2 id="ruthless-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
                Fewest deciding sets as favourite
              </h2>
              <Table rows={t.ruthless.slice(0, 10)} caption="Players whose favoured matches went to a deciding set least often against expectation, last two years" />
            </section>
          </div>

          <p className="text-xs text-muted">
            Favoured: the model gave the player more than a 50% chance. Expected deciding sets: from the scoreline model (with form on the
            day) for each match’s chance. Last two years for the lists; every completed match since 2016 for the tests. Retirements and
            walkovers left out. Fragility in the prediction test is shrunk toward zero for players with few matches.
          </p>
        </>
      )}
    </div>
  );
}
