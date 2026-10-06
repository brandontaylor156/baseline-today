import type { Metadata } from "next";
import Link from "next/link";

import { displayName } from "@/lib/data/tournaments";
import { createPublicClient } from "@/lib/supabase/public";
import type { PaceCache, PaceEvent } from "@/lib/sync/pace";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Court pace from scorelines",
  description:
    "How fast every ATP event plays, worked out from nothing but set scores and the players' ratings: more 6-4s and tiebreaks for the same players means serve is harder to break. Every event, every year since 2016.",
};

const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)}`;
const big = (e: PaceEvent) => /grand slam|1000/i.test(e.category ?? "");

export default async function PacePage() {
  const { data: row } = await createPublicClient().from("stat_cache").select("data").eq("key", "lab:pace").maybeSingle();
  const d = row?.data as unknown as PaceCache | undefined;
  const atp = d?.tours.atp;
  const wta = d?.tours.wta;
  const latest = atp ? Math.max(...atp.events.map((e) => e.season)) : 0;
  // Last twelve months-ish: the latest two seasons' most recent edition of each event.
  const recent = atp ? [...new Map([...atp.events].sort((a, b) => a.season - b.season).map((e) => [e.providerId ?? e.tournamentId, e])).values()].filter((e) => e.season >= latest - 1) : [];
  const ranked = [...recent].sort((a, b) => b.delta - a.delta);
  // The big events, year by year.
  const seasons = Array.from({ length: 5 }, (_, i) => latest - 4 + i);
  const series = atp
    ? [...new Map(atp.events.filter(big).map((e) => [e.providerId ?? e.tournamentId, atp.events.filter((x) => (x.providerId ?? x.tournamentId) === (e.providerId ?? e.tournamentId))])).values()]
        .map((xs) => ({ name: displayName([...xs].sort((a, b) => b.season - a.season)[0].name), surface: xs[0].surface, bySeason: new Map(xs.map((x) => [x.season, x.delta])) }))
        .sort((a, b) => (a.surface ?? "").localeCompare(b.surface ?? "") || a.name.localeCompare(b.name))
    : [];
  const wtaBig = wta ? [...new Map([...wta.events].filter(big).sort((a, b) => a.season - b.season).map((e) => [e.providerId ?? e.tournamentId, e])).values()].sort((a, b) => b.tiebreaks - a.tiebreaks) : [];

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Court pace from scorelines</h1>
        <p className="text-sm text-muted">
          Faster conditions make serve harder to break, so the same two players produce more 6-4s, 7-5s and tiebreaks. For every event
          we find the serve-point rate that best explains all its set scores, given each match’s pre-match chance. No ace counts or
          ball-tracking needed, which is why this works for events that publish no serve statistics.
        </p>
      </div>

      {!atp || !wta ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Computed weekly; check back soon.</p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            {atp.surfaces.map((s) => (
              <div key={s.surface} className="rounded-xl border border-border bg-surface p-4">
                <dt className="text-xs text-muted">ATP {s.surface.toLowerCase()} courts</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{signed(s.delta)}</dd>
                <dd className="text-xs text-muted">points of serve, vs the tour ({s.events} events)</dd>
              </div>
            ))}
          </dl>
          <p className="max-w-2xl text-sm">
            Is it real? The same event’s pace in consecutive years correlates at <strong>{atp.persistence.r.toFixed(2)}</strong> (
            {atp.persistence.pairs} pairs), and the surfaces come out in the expected order. A number made of noise would do neither.
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            {[
              { title: "Fastest ATP events lately", rows: ranked.slice(0, 12) },
              { title: "Slowest ATP events lately", rows: [...ranked].reverse().slice(0, 12) },
            ].map((t) => (
              <section key={t.title} aria-label={t.title} className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t.title}</h2>
                <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                  <table className="w-full text-sm tabular-nums">
                    <caption className="sr-only">{t.title}</caption>
                    <thead className="border-b border-border text-left text-xs text-muted">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-medium">Event</th>
                        <th scope="col" className="px-2 py-2 font-medium">Surface</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Pace</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {t.rows.map((e) => (
                        <tr key={e.tournamentId}>
                          <th scope="row" className="px-3 py-2 text-left font-normal">
                            <Link href={`/tournaments/${e.tournamentId}`} className="hover:underline">
                              {displayName(e.name)} {e.season}
                            </Link>
                          </th>
                          <td className="px-2 py-2 text-muted">{e.surface}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${e.delta > 0 ? "text-up" : e.delta < 0 ? "text-down" : ""}`}>{signed(e.delta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>

          <section aria-labelledby="series-heading" className="space-y-2">
            <h2 id="series-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Grand Slams and Masters, year by year (ATP)
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">Pace of each Grand Slam and Masters event by season</caption>
                <thead className="border-b border-border text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Event</th>
                    {seasons.map((y) => (
                      <th key={y} scope="col" className="px-2 py-2 text-right font-medium">
                        {y}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {series.map((s) => (
                    <tr key={s.name}>
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        {s.name} <span className="text-xs text-muted">{s.surface}</span>
                      </th>
                      {seasons.map((y) => {
                        const v = s.bySeason.get(y);
                        return (
                          <td key={y} className={`px-2 py-2 text-right ${v === undefined ? "text-muted" : v > 0 ? "text-up" : v < 0 ? "text-down" : ""}`}>
                            {v === undefined ? "–" : signed(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="wta-heading" className="space-y-2">
            <h2 id="wta-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              The WTA: a weaker signal
            </h2>
            <p className="max-w-2xl text-sm text-muted">
              Women’s serve-point rates sit close to the point where holding and breaking produce similar set scores, so scorelines say
              much less about pace. The tiebreak index (tiebreaks played minus expected, per 100 sets) still puts the surfaces in order
              (grass {signed(wta.surfaces.find((s) => s.surface === "Grass")?.tiebreaks ?? 0)}, hard{" "}
              {signed(wta.surfaces.find((s) => s.surface === "Hard")?.tiebreaks ?? 0)}, clay{" "}
              {signed(wta.surfaces.find((s) => s.surface === "Clay")?.tiebreaks ?? 0)}), but an event’s value barely carries from one year
              to the next (r = {wta.tiebreakPersistence.r.toFixed(2)}), so read single events with caution.
            </p>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
              {wtaBig.slice(0, 8).map((e) => (
                <li key={e.tournamentId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <Link href={`/tournaments/${e.tournamentId}`} className="hover:underline">
                    {displayName(e.name)} {e.season}
                  </Link>
                  <span className="shrink-0 text-muted tabular-nums">
                    {signed(e.tiebreaks)} tiebreaks per 100 sets · {e.surface}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-xs text-muted">
            Pace: the event’s best-fitting serve-point rate minus the tour’s, in percentage points, shrunk toward zero for small events.
            It mixes everything that makes serve stick: the surface, the balls, altitude and the weather. Completed matches with regular
            sets since 2016; events with eight or more. Updated weekly.
          </p>
        </>
      )}
    </div>
  );
}
