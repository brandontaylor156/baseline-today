import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { TimeMachine } from "@/components/time-machine";
import { getPeaks } from "@/lib/data/lab";
import { getModelInfo } from "@/lib/data/predictions";
import { formatDate, TOUR_LABEL } from "@/lib/format";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Tennis time machine: cross-era matchups and peak ratings",
  description: "Put any two players at any point in their careers against each other, on any surface, and see every player's peak rating since 2015.",
};

export default async function TimeMachinePage() {
  const [info, atp, wta] = await Promise.all([getModelInfo(), getPeaks("atp"), getPeaks("wta")]);
  const example: [number, number] | null = atp.length >= 2 ? [atp[0].id, atp[2]?.id ?? atp[1].id] : null;
  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Time machine</h1>
        <p className="text-sm text-muted">
          Every player’s rating after every week they played since 2015. Pick two players and a moment in each career, and the model
          says who it favours, on any surface.
        </p>
      </div>
      <TimeMachine calibration={info.calibration} example={example} />
      <div className="grid gap-6 lg:grid-cols-2">
        {(
          [
            ["atp", atp],
            ["wta", wta],
          ] as const
        ).map(([tour, peaks]) => (
          <section key={tour} aria-labelledby={`p-${tour}`} className="space-y-2">
            <h2 id={`p-${tour}`} className="text-sm font-semibold uppercase tracking-wide text-muted">
              {TOUR_LABEL[tour]} peak ratings since 2015
            </h2>
            <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
              {peaks.slice(0, 15).map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                  <Flag code={p.country} reserve />
                  <Link href={`/players/${p.id}`} className="min-w-0 flex-1 truncate hover:underline">
                    {p.name}
                  </Link>
                  <span className="shrink-0 text-xs text-muted">{formatDate(p.week)}</span>
                  <span className="w-12 shrink-0 text-right font-semibold tabular-nums">{Math.round(p.peak)}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <p className="text-xs text-muted">
        Ratings come from the site’s surface-aware Elo model replayed over every tracked result since 2015 (players start at 1500, so
        the first months of 2015 understate established players). Players with at least 40 matches.
      </p>
    </div>
  );
}
