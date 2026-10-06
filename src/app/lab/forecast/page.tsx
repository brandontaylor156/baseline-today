import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { isTour, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import type { ForecastPlayer } from "@/lib/sync/forecast";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "If a Grand Slam started today",
  description: "Each player's chance of winning a 128-player Grand Slam starting today, on hard, clay and grass: hundreds of draws made with real seeding rules, each solved exactly.",
};

const SURFACES = ["hard", "clay", "grass"] as const;
// reach[r] = chance of winning at least r matches in a 128 draw: 3 wins reaches the last 16,
// 4 the quarterfinals, 5 the semis, 6 the final, 7 the title.
const COLUMNS = [
  { label: "R16", wins: 3 },
  { label: "QF", wins: 4 },
  { label: "SF", wins: 5 },
  { label: "Final", wins: 6 },
  { label: "Title", wins: 7 },
];
const pct = (p: number | undefined) => (p === undefined ? "–" : p >= 0.995 ? "99%+" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);

export default async function ForecastPage({ searchParams }: PageProps<"/lab/forecast">) {
  const q = await searchParams;
  const tour: Tour = typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp";
  const surface = SURFACES.find((s) => s === q.surface) ?? "hard";
  const { data } = await createPublicClient().from("stat_cache").select("data, updated_at").eq("key", `forecast:${tour}`).maybeSingle();
  const f = data?.data as { draws: number; surfaces: Record<string, ForecastPlayer[]> } | undefined;
  const rows = f?.surfaces[surface] ?? [];
  const link = (t: Tour, s: string) => `/lab/forecast?tour=${t}&surface=${s}`;

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">If a Grand Slam started today</h1>
        <p className="text-sm text-muted">
          A 128-player draw from this week’s field, the top 32 seeded by ranking with the real Grand Slam placement rules, everyone else
          drawn at random. We make {f?.draws ?? 200} random draws and solve each one exactly, so the chances include the luck of the draw.
          {tour === "atp" ? " Men play best of five." : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <nav aria-label="Tour" className="flex overflow-hidden rounded-lg border border-border">
          {(["atp", "wta"] as const).map((t) => (
            <Link key={t} href={link(t, surface)} aria-current={t === tour ? "page" : undefined} className={`px-3 py-1.5 ${t === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {TOUR_LABEL[t]}
            </Link>
          ))}
        </nav>
        <nav aria-label="Surface" className="flex overflow-hidden rounded-lg border border-border">
          {SURFACES.map((s) => (
            <Link key={s} href={link(tour, s)} aria-current={s === surface ? "page" : undefined} className={`px-3 py-1.5 capitalize ${s === surface ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {s}
            </Link>
          ))}
        </nav>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">The forecast is computed daily; check back soon.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">
              Chances to reach each round of a {surface} Grand Slam starting today, {TOUR_LABEL[tour]}
            </caption>
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Player</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Seed</th>
                {COLUMNS.map((c) => (
                  <th key={c.label} scope="col" className={`px-2 py-2 text-right font-medium ${c.label === "R16" ? "hidden sm:table-cell" : ""}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.slice(0, 20).map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="max-w-0 px-3 py-2 text-left font-normal sm:max-w-none">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Flag code={p.country} reserve />
                      <Link href={`/players/${p.id}`} className="truncate hover:underline">
                        {p.name}
                      </Link>
                    </span>
                  </th>
                  <td className="px-2 py-2 text-right text-muted">{p.seed ?? "–"}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.label} className={`px-2 py-2 text-right ${c.label === "Title" ? "font-semibold" : ""} ${c.label === "R16" ? "hidden sm:table-cell" : ""}`}>
                      {pct(p.reach[c.wins])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">
        Updated daily from current ratings and this week’s rankings. A forecast of the model, not of injuries, withdrawals or form swings;
        estimates, not betting advice.
      </p>
    </div>
  );
}
