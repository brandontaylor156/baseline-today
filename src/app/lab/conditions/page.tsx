import type { Metadata } from "next";
import Link from "next/link";

import { displayName } from "@/lib/data/tournaments";
import { createPublicClient } from "@/lib/supabase/public";
import type { ConditionsCache } from "@/lib/sync/conditions-analysis";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Heat, altitude and jet lag",
  description:
    "Real weather for every outdoor tournament since 2015 (ERA5 via Open-Meteo), venue elevation and time zones, joined to every match: does heat make upsets and retirements more likely, does altitude speed courts up, does jet lag cost matches?",
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x))}`;

export default async function ConditionsPage() {
  const { data: row } = await createPublicClient().from("stat_cache").select("data").eq("key", "lab:conditions").maybeSingle();
  const d = row?.data as unknown as ConditionsCache | undefined;

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Heat, altitude and jet lag</h1>
        <p className="text-sm text-muted">
          The actual weather during every outdoor tournament we track, each venue’s elevation and time zone, and whether the event was
          played indoors, joined to every match since 2016 and measured against the ratings.
        </p>
      </div>

      {!d ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Computed weekly; check back soon.</p>
      ) : (
        <>
          <section aria-labelledby="heat-heading" className="space-y-3">
            <h2 id="heat-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Heat and upsets
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {(["atp", "wta"] as const).map((tour) => {
                const t = d.tours[tour];
                const real = t.heat.low > 0 || t.heat.high < 0;
                return (
                  <div key={tour} className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
                    <h3 className="font-semibold">{tour.toUpperCase()}</h3>
                    <p>
                      A player the model makes a 70% favourite wins <strong>{pct(t.favourite70.at20)}</strong> on a 20 °C day,{" "}
                      {pct(t.favourite70.at30)} at 30 °C and <strong>{pct(t.favourite70.at35)}</strong> at 35 °C.
                    </p>
                    <p className="text-xs text-muted">
                      {real ? "The heat effect is clear of zero" : "The heat effect isn’t distinguishable from zero"} ({t.heat.matches.toLocaleString("en-US")} outdoor
                      matches with weather).
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="ret-heading" className="space-y-2">
            <h2 id="ret-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Retirements by the day’s high temperature
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">Share of matches ending in a retirement, by daily high temperature (outdoors) and indoors</caption>
                <thead className="border-b border-border text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Daily high (event average)</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">ATP</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">WTA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.tours.atp.retirements.map((b, i) => (
                    <tr key={b.bin}>
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        {b.bin}
                      </th>
                      {[b, d.tours.wta.retirements[i]].map((x, j) => (
                        <td key={j} className="px-3 py-2 text-right">
                          {x.matches >= 100 ? pct(x.rate) : "–"} <span className="text-xs text-muted">({x.matches.toLocaleString("en-US")})</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="px-3 py-2 text-left font-normal text-muted">
                      Indoors (no weather)
                    </th>
                    {[d.tours.atp.indoorRetirement, d.tours.wta.indoorRetirement].map((x, j) => (
                      <td key={j} className="px-3 py-2 text-right text-muted">
                        {pct(x.rate)} <span className="text-xs">({x.matches.toLocaleString("en-US")})</span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="jet-heading" className="space-y-2">
            <h2 id="jet-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Jet lag
            </h2>
            <p className="max-w-2xl text-sm">
              In the first match after crossing five or more time zones since the last event (within three weeks), players do{" "}
              {(["atp", "wta"] as const)
                .map((tour) => {
                  const j = d.tours[tour].jetlag;
                  return `${signed(j.east.points)} rating points after flying east and ${signed(j.west.points)} after flying west on the ${tour.toUpperCase()} (95%: ${signed(j.east.low)} to ${signed(j.east.high)} east; ${j.east.matches.toLocaleString("en-US")} and ${j.west.matches.toLocaleString("en-US")} matches)`;
                })
                .join("; ")}
              .
            </p>
            <p className="max-w-2xl text-sm text-muted">
              If anything, long-haul travellers do better than their ratings, not worse. That is almost certainly selection rather than
              a benefit of jet lag: players choose which far-away events to fly to, and they fly to the ones they’re ready for. Results
              alone can’t show a jet-lag cost; it would take knowing who travelled without choosing to.
            </p>
          </section>

          <section aria-labelledby="alt-heading" className="space-y-2">
            <h2 id="alt-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Altitude and court pace
            </h2>
            <p className="max-w-2xl text-sm">
              Thin air should make the ball fly. Across {d.altitude.events} ATP events, venue elevation correlates{" "}
              <strong>{d.altitude.r.toFixed(2)}</strong> with the{" "}
              <Link href="/lab/pace" className="underline hover:text-foreground">
                court pace worked out from scorelines
              </Link>
              : {Math.abs(d.altitude.r) < 0.2 ? "a weak link at most. The surface and balls matter far more than the air." : "a real link."}
            </p>
            {d.altitude.high.length > 0 && (
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
                {d.altitude.high.map((e) => (
                  <li key={`${e.name}-${e.season}`} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span>
                      {displayName(e.name)} {e.season}
                    </span>
                    <span className="shrink-0 text-muted tabular-nums">
                      {Math.round(e.elevation).toLocaleString("en-US")} m · pace {signed(e.delta)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-muted">
            Sources: weather from the{" "}
            <a href="https://open-meteo.com/" className="underline">
              Open-Meteo
            </a>{" "}
            historical archive (ERA5 reanalysis, Copernicus Climate Change Service; CC BY 4.0), the daily maximum and apparent temperature
            averaged over each event’s dates at the venue; venue coordinates, elevation and time zone from Open-Meteo’s geocoder (GeoNames,
            CC BY 4.0); indoor or outdoor from each event’s Wikipedia article (CC BY-SA 4.0). Coverage: {d.coverage.events} events,{" "}
            {d.coverage.indoor} indoor, {d.coverage.withWeather} with weather. We don’t know match times or which matches were under a roof,
            so heat is the event’s daily average: an association, not the conditions of each match.
          </p>
        </>
      )}
    </div>
  );
}
