import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { formatDate, isTour, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Who's in form",
  description: "ATP and WTA players winning more (or less) than the model expected over the last 30, 60 or 90 days: form against each matchup, not just win-loss.",
};

const WINDOWS = [30, 60, 90] as const;
type Row = { player_id: number; name: string; country: string | null; matches: number; wins: number; expected: number; last_match: string };

function Table({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">{title}</caption>
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Player</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Record</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Expected wins</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Above</th>
              <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Last played</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const d = r.wins - r.expected;
              return (
                <tr key={r.player_id}>
                  <th scope="row" className="max-w-0 px-3 py-2 text-left font-normal sm:max-w-none">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Flag code={r.country} reserve />
                      <Link href={`/players/${r.player_id}`} className="truncate hover:underline">
                        {r.name}
                      </Link>
                    </span>
                  </th>
                  <td className="px-2 py-2 text-right">
                    {r.wins}–{r.matches - r.wins}
                  </td>
                  <td className="px-2 py-2 text-right text-muted">{r.expected.toFixed(1)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${d >= 0 ? "text-up" : "text-down"}`}>
                    {d >= 0 ? "+" : "−"}
                    {Math.abs(d).toFixed(1)}
                  </td>
                  <td className="hidden px-3 py-2 text-right text-muted sm:table-cell">{formatDate(r.last_match)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function FormPage({ searchParams }: PageProps<"/lab/form">) {
  const q = await searchParams;
  const tour: Tour = typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const days = WINDOWS.find((w) => String(w) === q.days) ?? 60;
  const { data } = await createPublicClient().rpc("lab_form", { p_tour: tour, p_days: days, p_min: days >= 60 ? 6 : 4 });
  const rows = (data ?? []) as Row[];
  const hot = [...rows].sort((a, b) => b.wins - b.expected - (a.wins - a.expected)).slice(0, 15);
  const cold = [...rows].sort((a, b) => a.wins - a.expected - (b.wins - b.expected)).slice(0, 15);
  const link = (t: Tour, d: number) => `/lab/form?tour=${t}&days=${d}`;

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Who’s in form</h1>
        <p className="text-sm text-muted">
          Wins over the last {days} days against the wins our model expected from each matchup. Beating strong opponents counts for more
          than piling up wins against weaker ones.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <nav aria-label="Tour" className="flex overflow-hidden rounded-lg border border-border">
          {(["atp", "wta"] as const).map((t) => (
            <Link key={t} href={link(t, days)} aria-current={t === tour ? "page" : undefined} className={`px-3 py-1.5 ${t === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {TOUR_LABEL[t]}
            </Link>
          ))}
        </nav>
        <nav aria-label="Window" className="flex overflow-hidden rounded-lg border border-border">
          {WINDOWS.map((d) => (
            <Link key={d} href={link(tour, d)} aria-current={d === days ? "page" : undefined} className={`px-3 py-1.5 ${d === days ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {d} days
            </Link>
          ))}
        </nav>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Not enough recent matches in this window.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Table title="Hot: winning more than expected" rows={hot} />
          <Table title="Cold: winning less than expected" rows={cold} />
        </div>
      )}
      <p className="text-xs text-muted">
        Expected wins add up our model’s pre-match chance in each match. Walkovers excluded; players need {days >= 60 ? 6 : 4}+ tracked
        matches in the window. Ratings catch up with form over time, so the hottest players also rise in the ratings.
      </p>
    </div>
  );
}
