import type { Metadata } from "next";
import Link from "next/link";

import { createPublicClient } from "@/lib/supabase/public";
import type { TraitEffect, TraitsCache } from "@/lib/sync/traits-analysis";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Lefties, one-handers and height",
  description:
    "Does being left-handed, playing a one-handed backhand or being tall win matches beyond what the ratings say? Every match since 2016, with each player's hand and height from Wikidata and Wikipedia.",
};

const TOURS = [
  { key: "atp", label: "ATP", color: "var(--chart-line)" },
  { key: "wta", label: "WTA", color: "var(--chart-line-2)" },
] as const;
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x))}`;
const real = (e: TraitEffect) => e.low > 0 || e.high < 0;

export default async function TraitsPage() {
  const { data: row } = await createPublicClient().from("stat_cache").select("data").eq("key", "lab:traits").maybeSingle();
  const d = row?.data as unknown as TraitsCache | undefined;
  const atp = d?.tours.atp;
  const wta = d?.tours.wta;
  const all = d ? TOURS.flatMap((t) => d.tours[t.key].effects.flatMap((e) => [e.low, e.high])) : [];
  const max = Math.ceil(Math.max(20, ...all.map(Math.abs)) / 10) * 10;
  const at = (v: number) => `${((v + max) / (2 * max)) * 100}%`;
  const get = (t: typeof atp, k: string) => t!.effects.find((e) => e.key === k)!;

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Lefties, one-handers and height</h1>
        <p className="text-sm text-muted">
          Each player’s playing hand, backhand and height as Wikidata (CC0) records them, filled in from their Wikipedia infobox where
          Wikidata is silent, joined to every match since 2016. Each effect is measured on top of the ratings: does it win more than the
          model already expects?
        </p>
      </div>

      {!atp || !wta ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Computed weekly; check back soon.</p>
      ) : (
        <>
          <section aria-labelledby="effects-heading" className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="effects-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
                Effect in rating points, beyond the ratings
              </h2>
              <ul className="flex gap-4 text-xs text-muted" aria-label="Legend">
                {TOURS.map((t) => (
                  <li key={t.key} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ background: t.color }} aria-hidden />
                    {t.label}
                  </li>
                ))}
              </ul>
            </div>
            <div role="img" aria-label="Each trait's effect in rating points with a 95% interval, ATP and WTA. Values are in the table below.">
              {atp.effects.map((e, i) => (
                <div key={e.key} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-x-3 border-b border-border py-2 last:border-b-0 sm:grid-cols-[minmax(0,15rem)_1fr]">
                  <div className="text-xs sm:text-sm">{e.label}</div>
                  <div className="relative h-8">
                    <div className="absolute inset-y-0 w-px bg-border" style={{ left: at(0) }} aria-hidden />
                    {TOURS.map((t, j) => {
                      const r = d!.tours[t.key].effects[i];
                      return (
                        <div key={t.key} className="absolute inset-x-0" style={{ top: j === 0 ? "30%" : "70%" }}>
                          <div className="absolute h-0.5 -translate-y-1/2 rounded-full" style={{ left: at(r.low), width: `calc(${at(r.high)} - ${at(r.low)})`, background: t.color }} />
                          <div className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ left: at(r.points), borderColor: t.color, background: real(r) ? t.color : "var(--surface)" }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted">Filled dots: the 95% interval excludes zero. Right of zero: wins more than the ratings expect.</p>
          </section>

          <section aria-labelledby="found-heading" className="max-w-2xl space-y-2">
            <h2 id="found-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              What we found
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>
                <strong>Tall players beat their ratings.</strong> Every 10 cm is worth {signed(get(atp, "height").points)} rating points on
                the ATP ({signed(get(atp, "height").low)} to {signed(get(atp, "height").high)}) and {signed(get(wta, "height").points)} on
                the WTA. For men it’s a fast-court effect: {signed(get(atp, "height-grass").points)} on grass, {signed(get(atp, "height-clay").points)}{" "}
                on clay.
              </li>
              <li>
                <strong>No left-handed edge beyond the ratings.</strong> Lefties win about what their ratings say against right-handers:{" "}
                {signed(get(atp, "lefty").points)} (ATP) and {signed(get(wta, "lefty").points)} (WTA), both within noise. If being left-handed
                helps, the ratings already price it in.
              </li>
              <li>
                <strong>One-handed backhands slightly under their ratings,</strong> about {signed(get(atp, "one-handed").points)} (ATP) and{" "}
                {signed(get(wta, "one-handed").points)} (WTA), but the intervals reach zero: suggestive, not settled.
              </li>
            </ul>
          </section>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">Each trait’s effect in rating points with a 95% interval and the matches measured</caption>
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Trait</th>
                  {TOURS.map((t) => (
                    <th key={t.key} scope="col" className="px-3 py-2 text-right font-medium">
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {atp.effects.map((e, i) => (
                  <tr key={e.key}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      {e.label}
                    </th>
                    {[e, wta.effects[i]].map((r, j) => (
                      <td key={j} className={`px-3 py-2 text-right ${real(r) ? "font-semibold" : "text-muted"}`}>
                        {signed(r.points)}{" "}
                        <span className="text-xs font-normal text-muted">
                          ({signed(r.low)} to {signed(r.high)}; {r.matches.toLocaleString("en-US")})
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted">
            Coverage: playing hand known for {atp.coverage.hand} ATP players ({atp.coverage.lefties} left-handed) and {wta.coverage.hand}{" "}
            WTA ({wta.coverage.lefties}); backhand for {atp.coverage.backhand} and {wta.coverage.backhand}; height for {atp.coverage.height}{" "}
            and {wta.coverage.height}. Matches count only when both players’ trait is known. Effects come from a logistic regression of each
            result on the model’s pre-match chance and the trait gap; 2015 is left out as burn-in. Associations, not causes.
          </p>
        </>
      )}
    </div>
  );
}
