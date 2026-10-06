import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { isTour, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Clutch index: tiebreaks and deciding sets against expectation",
  description: "Which tennis players win more tiebreaks and deciding sets than the matchup says they should, from every result since 2015 and a point-level model.",
};

type Row = { id: number; name: string; country: string | null; n: number; won: number; expected: number; z: number };

function Table({ title, note, rows }: { title: string; note: string; rows: Row[] }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <p className="text-xs text-muted">{note}</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">{title}</caption>
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Player</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Won</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Expected</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Clutch score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="max-w-0 px-3 py-2 text-left font-normal sm:max-w-none">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Flag code={r.country} reserve />
                    <Link href={`/players/${r.id}`} className="truncate hover:underline">
                      {r.name}
                    </Link>
                  </span>
                </th>
                <td className="px-2 py-2 text-right">
                  {r.won}/{r.n}
                </td>
                <td className="px-2 py-2 text-right text-muted">{r.expected.toFixed(1)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${r.z > 0 ? "text-up" : "text-down"}`}>
                  {r.z > 0 ? "+" : "−"}
                  {Math.abs(r.z).toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function ClutchPage({ searchParams }: PageProps<"/lab/clutch">) {
  const { tour: q } = await searchParams;
  const tour: Tour = typeof q === "string" && isTour(q) ? q : "atp";
  const { data } = await createPublicClient()
    .from("lab_clutch")
    .select("player_id, tb_n, tb_won, tb_expected, tb_variance, dec_n, dec_won, dec_expected, dec_variance, players!inner(full_name, country_code)")
    .eq("tour", tour)
    .not("player_id", "is", null)
    .limit(2000);
  type Raw = { player_id: number; tb_n: number; tb_won: number; tb_expected: number; tb_variance: number; dec_n: number; dec_won: number; dec_expected: number; dec_variance: number; players: { full_name: string; country_code: string | null } };
  const raw = (data ?? []) as unknown as Raw[];
  const make = (min: number, f: "tb" | "dec") =>
    raw
      .filter((r) => r[`${f}_n`] >= min && r[`${f}_variance`] > 0)
      .map((r) => ({
        id: r.player_id,
        name: r.players.full_name,
        country: r.players.country_code,
        n: r[`${f}_n`],
        won: r[`${f}_won`],
        expected: r[`${f}_expected`],
        z: (r[`${f}_won`] - r[`${f}_expected`]) / Math.sqrt(r[`${f}_variance`]),
      }));
  const tb = make(60, "tb");
  const dec = make(40, "dec");
  const top = (rows: Row[]) => [...rows].sort((a, b) => b.z - a.z).slice(0, 10);
  const bottom = (rows: Row[]) => [...rows].sort((a, b) => a.z - b.z).slice(0, 10);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <Link href="/lab" className="text-sm text-muted hover:text-foreground">
            ← Research lab
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Clutch index</h1>
          <p className="text-sm text-muted">
            For every match since 2015, a point-level model fitted to the matchup gives each player’s chance of winning a tiebreak and a
            deciding set. Winning more than that, over hundreds of chances, is clutch, or a strength the overall rating misses.
          </p>
        </div>
        <nav aria-label="Tour" className="flex overflow-hidden rounded-lg border border-border text-sm">
          {(["atp", "wta"] as const).map((t) => (
            <Link key={t} href={`/lab/clutch?tour=${t}`} aria-current={t === tour ? "page" : undefined} className={`px-3 py-1.5 ${t === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {TOUR_LABEL[t]}
            </Link>
          ))}
        </nav>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Table title="Tiebreaks: above expectation" note="At least 60 tiebreaks. Big servers often appear here: tiebreaks reward serving more than the overall rating does." rows={top(tb)} />
        <Table title="Tiebreaks: below expectation" note="At least 60 tiebreaks." rows={bottom(tb)} />
        <Table title="Deciding sets: above expectation" note="At least 40 deciding sets." rows={top(dec)} />
        <Table title="Deciding sets: below expectation" note="At least 40 deciding sets." rows={bottom(dec)} />
      </div>
      <p className="text-xs text-muted">
        Clutch score: how many standard deviations above (or below) expectation; beyond ±2 is unlikely to be chance alone. Expectations
        come from each match’s pre-match chance through a point-by-point model of serve and return, so being the better player doesn’t
        count as clutch. Retirements are left out. Recomputed weekly.
      </p>
    </div>
  );
}
