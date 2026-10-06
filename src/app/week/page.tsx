import type { Metadata } from "next";
import Link from "next/link";

import { getRecapWeeks } from "@/lib/data/weekly";
import { weekLabel } from "@/lib/weeks";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Week in tennis",
  description: "A recap of every tennis week: ATP and WTA champions, the biggest upsets, ranking movers and how our model did.",
};

export default async function WeeksPage() {
  const season = new Date().getUTCFullYear();
  const [current, previous] = await Promise.all([getRecapWeeks(season), getRecapWeeks(season - 1)]);
  const weeks = [...current, ...previous.filter((w) => !current.includes(w))];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Week in tennis</h1>
        <p className="text-sm text-muted">Champions, the biggest upsets, ranking movers and our model’s record, week by week.</p>
      </div>
      {weeks.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">No finished weeks yet.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
          {weeks.map((w) => (
            <li key={w}>
              <Link href={`/week/${w}`} className="flex justify-between px-4 py-3 hover:bg-surface-muted">
                <span className="font-medium">{weekLabel(w)}</span>
                <span className="text-muted">Recap →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
