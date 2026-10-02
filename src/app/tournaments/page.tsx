import type { Metadata } from "next";
import Link from "next/link";

import { calendarSections, dateRange, displayName, getSeasonTournaments, type TournamentSummary } from "@/lib/data/tournaments";
import { TOUR_LABEL } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tournaments",
  description: "This week's ATP and WTA tournaments, what's next, recent champions and the full season calendar.",
};
export const revalidate = 3600;

function Row({ t }: { t: TournamentSummary }) {
  return (
    <li>
      <Link href={`/tournaments/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted">
        <span className="w-24 shrink-0 text-xs text-muted tabular-nums">{dateRange(t.startDate, t.endDate)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{displayName(t.name)}</span>
          <span className="block truncate text-xs text-muted">
            {[TOUR_LABEL[t.tour], t.category, t.location ? displayName(t.location.split(",")[0]) : null, t.surface].filter(Boolean).join(" · ")}
          </span>
        </span>
        {t.champion && (
          <span className="shrink-0 text-right text-xs">
            <span className="block text-muted">Champion</span>
            <span className="font-medium">{t.champion.name}</span>
          </span>
        )}
      </Link>
    </li>
  );
}

function Section({ title, list, empty }: { title: string; list: TournamentSummary[]; empty?: string }) {
  if (list.length === 0 && !empty) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {list.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {list.map((t) => (
            <Row key={t.id} t={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function TournamentsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const season = Number(today.slice(0, 4));
  const list = await getSeasonTournaments(season);
  const { now, upcoming, finished } = calendarSections(list, today);

  const months = new Map<string, TournamentSummary[]>();
  for (const t of list) {
    const key = t.startDate?.slice(0, 7) ?? "unknown";
    months.set(key, [...(months.get(key) ?? []), t]);
  }
  const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Tournaments</h1>
        <p className="text-sm text-muted">
          {season} ATP and WTA singles calendar · Add to your calendar:{" "}
          <a href={`${SITE_URL.replace(/^https:/, "webcal:")}/calendar/atp.ics`} className="font-medium text-accent hover:underline">
            ATP
          </a>{" "}
          ·{" "}
          <a href={`${SITE_URL.replace(/^https:/, "webcal:")}/calendar/wta.ics`} className="font-medium text-accent hover:underline">
            WTA
          </a>
        </p>
      </div>

      <Section title="This week" list={now} empty="No tour events this week." />
      <Section title="Coming up" list={upcoming} />
      <Section title="Recently finished" list={finished} />

      <section aria-label="Full season" className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Full season</h2>
        {[...months.entries()].map(([month, items]) => (
          <details key={month} className="group rounded-xl border border-border bg-surface" open={month === today.slice(0, 7)}>
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-medium select-none">
              {month === "unknown" ? "Date to be confirmed" : monthName.format(new Date(`${month}-01T00:00:00Z`))}
              <span className="text-xs text-muted">{items.length} events</span>
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {items.map((t) => (
                <Row key={t.id} t={t} />
              ))}
            </ul>
          </details>
        ))}
      </section>
    </div>
  );
}
