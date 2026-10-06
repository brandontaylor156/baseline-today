import type { Metadata } from "next";
import Link from "next/link";

import { categoryWeight, getEvents } from "@/lib/data/history";
import { TOUR_LABEL } from "@/lib/format";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Tournament history",
  description: "Past winners, finals and records of every ATP and WTA tournament since 2015.",
};

export default async function HistoryIndex() {
  const events = await getEvents();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Tournament history</h1>
        <p className="text-sm text-muted">Past champions, every final and the biggest upsets of each event since 2015.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {(["atp", "wta"] as const).map((tour) => (
          <section key={tour} aria-labelledby={`h-${tour}`} className="space-y-2">
            <h2 id={`h-${tour}`} className="text-sm font-semibold uppercase tracking-wide text-muted">
              {TOUR_LABEL[tour]}
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
              {events
                .filter((e) => e.tour === tour && e.seasons >= 2)
                .sort((a, b) => categoryWeight(a.category) - categoryWeight(b.category) || a.name.localeCompare(b.name))
                .map((e) => (
                  <li key={e.slug}>
                    <Link href={`/history/${e.slug}`} className="flex items-baseline justify-between gap-3 px-4 py-2 hover:bg-surface-muted">
                      <span className="min-w-0 truncate font-medium">{e.name}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {e.category ?? ""} · {e.seasons} editions
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
