import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { displayName } from "@/lib/data/tournaments";
import { formatDate, isTour, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import type { RebuiltCache } from "@/lib/sync/rebuilt-rankings";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Rankings on any date",
  description:
    "ATP and WTA rankings rebuilt from results for any week since 2016, with a what-if: the ranking without any one tournament. Plus every week's No. 1, and how close the rebuild comes to the real thing.",
};

const BEST: Record<Tour, number> = { atp: 19, wta: 18 };
const DAY = 86_400_000;

export default async function RebuiltRankingsPage({ searchParams }: PageProps<"/rankings/rebuilt">) {
  const q = await searchParams;
  const tour: Tour = typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const today = new Date().toISOString().slice(0, 10);
  const date = typeof q.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.date) && q.date >= "2016-01-01" && q.date <= today ? q.date : today;
  const without = typeof q.without === "string" && /^-?\d+$/.test(q.without) ? Number(q.without) : null;
  const db = createPublicClient();
  const from = new Date(Date.parse(`${date}T00:00:00Z`) - 363 * DAY).toISOString().slice(0, 10);

  const [{ data: ranking }, { data: base }, { data: inWindow }, { data: cache }] = await Promise.all([
    db.rpc("rebuilt_ranking", { p_tour: tour, p_date: date, p_exclude: without ?? undefined, p_best: BEST[tour], p_limit: 50 }),
    without !== null ? db.rpc("rebuilt_ranking", { p_tour: tour, p_date: date, p_best: BEST[tour], p_limit: 200 }) : Promise.resolve({ data: null }),
    db.from("ranking_points").select("tournament_id, category, end_date").eq("tour", tour).gte("end_date", from).lte("end_date", date).in("category", tour === "atp" ? ["Grand Slam", "Masters 1000", "ATP Finals"] : ["Grand Slam", "WTA 1000", "WTA Finals"]).limit(5000),
    db.from("stat_cache").select("data").eq("key", "rankings:rebuilt").maybeSingle(),
  ]);
  // The biggest events in the window, for the what-if.
  const events = [...new Map((inWindow ?? []).map((e) => [e.tournament_id, e])).values()].sort((a, b) => a.end_date.localeCompare(b.end_date));
  const { data: named } = await db.from("tournaments").select("id, name").in("id", events.map((e) => e.tournament_id).filter((id) => id > 0));
  const nameOf = new Map((named ?? []).map((t) => [t.id, displayName(t.name)]));
  const label = (e: { tournament_id: number; category: string; end_date: string }) => `${e.tournament_id < 0 ? e.category : (nameOf.get(e.tournament_id) ?? e.category)} ${e.end_date.slice(0, 4)}`;
  const before = new Map((base ?? []).map((r) => [r.player_key, r.rank]));
  const rebuilt = cache?.data as unknown as RebuiltCache | undefined;
  const stints = rebuilt?.no1[tour] ?? [];
  const weeks = [...stints.reduce((m, s) => m.set(s.name, (m.get(s.name) ?? 0) + s.weeks), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const acc = rebuilt?.accuracy[tour];
  const href = (t: Tour) => `/rankings/rebuilt?tour=${t}&date=${date}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <Link href={`/rankings/${tour}`} className="text-sm text-muted hover:text-foreground">
            ← Rankings
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Rankings on any date</h1>
          <p className="text-sm text-muted">
            Rebuilt from results: each player’s best {BEST[tour]} results of the 52 weeks to the date you pick, with our points table.
            Take any big event out to see what it was worth.
          </p>
        </div>
        <nav aria-label="Tour" className="flex overflow-hidden rounded-lg border border-border text-sm">
          {(["atp", "wta"] as const).map((t) => (
            <Link key={t} href={href(t)} aria-current={t === tour ? "page" : undefined} className={`px-3 py-1.5 ${t === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {TOUR_LABEL[t]}
            </Link>
          ))}
        </nav>
      </div>

      <form action="/rankings/rebuilt" className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="tour" value={tour} />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Date</span>
          <input type="date" name="date" defaultValue={date} min="2016-01-01" max={today} className="min-h-11 rounded-lg border border-border bg-surface px-3 py-2" />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted">Without</span>
          <select name="without" defaultValue={without ?? ""} className="min-h-11 max-w-full rounded-lg border border-border bg-surface px-3 py-2">
            <option value="">Nothing (the ranking as rebuilt)</option>
            {events.map((e) => (
              <option key={e.tournament_id} value={e.tournament_id}>
                {label(e)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="min-h-11 rounded-lg border border-border px-4 py-2 font-medium hover:bg-surface-muted">
          Show
        </button>
      </form>

      <section aria-labelledby="table-heading" className="space-y-2">
        <h2 id="table-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          {TOUR_LABEL[tour]} top 50, {formatDate(date)}
          {without !== null && events.find((e) => e.tournament_id === without) ? `, without ${label(events.find((e) => e.tournament_id === without)!)}` : ""}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">Rebuilt ranking</caption>
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-right font-medium">#</th>
                <th scope="col" className="px-2 py-2 font-medium">Player</th>
                {without !== null && (
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Change
                  </th>
                )}
                <th scope="col" className="px-2 py-2 text-right font-medium">Points</th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Events</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(ranking ?? []).map((r) => {
                const was = before.get(r.player_key);
                const move = was === undefined ? null : was - r.rank;
                return (
                  <tr key={r.player_key}>
                    <td className="px-3 py-2 text-right font-semibold">{r.rank}</td>
                    <th scope="row" className="px-2 py-2 text-left font-normal">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Flag code={r.country} reserve />
                        {r.player_id ? (
                          <Link href={`/players/${r.player_id}`} className="hover:underline">
                            {r.name}
                          </Link>
                        ) : (
                          <span>{r.name}</span>
                        )}
                      </span>
                    </th>
                    {without !== null && (
                      <td className={`px-2 py-2 text-right ${move ? (move > 0 ? "text-up" : "text-down") : "text-muted"}`}>
                        {move === null ? "new" : move === 0 ? "–" : `${move > 0 ? "▲" : "▼"} ${Math.abs(move)}`}
                      </td>
                    )}
                    <td className="px-2 py-2 text-right">{r.points.toLocaleString("en-US")}</td>
                    <td className="hidden px-3 py-2 text-right text-muted sm:table-cell">{r.events}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {stints.length > 0 && (
        <section aria-labelledby="no1-heading" className="space-y-3">
          <h2 id="no1-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Every No. 1 since 2016, as rebuilt
          </h2>
          <p className="text-sm">
            {weeks
              .slice(0, 6)
              .map(([n, w]) => `${n} ${w} weeks`)
              .join(" · ")}
          </p>
          <ol className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {[...stints].reverse().map((s) => (
              <li key={s.from} className="flex items-center justify-between gap-3 px-3 py-2">
                <Link href={`/rankings/rebuilt?tour=${tour}&date=${s.from}`} className="hover:underline">
                  {s.name}
                </Link>
                <span className="shrink-0 text-muted tabular-nums">
                  {formatDate(s.from)} – {formatDate(s.to)} · {s.weeks} wk
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {acc && (
        <p className="max-w-2xl text-xs text-muted">
          How close is it? Against the rankings we hold ({acc.dates} weeks from 2025): {Math.round(acc.top10 * 100)}% of each real top 10
          is in the rebuilt top 10, the same No. 1 {Math.round(acc.no1 * 100)}% of the time, a rank correlation of {acc.spearman.toFixed(2)}{" "}
          across the top 100, and the top 20’s points within {Math.round(acc.pointsGap * 100)}% typically. Not reproduced: Davis Cup points
          (until 2016), the 2020–21 pandemic rules (frozen rankings, a longer window), mandatory-event rules, Challenger results, and
          results Wikipedia doesn’t have. Wimbledon 2022 counts for nothing, as it did. An estimate, not the tours’ rankings.
        </p>
      )}
    </div>
  );
}
