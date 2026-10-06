import type { Metadata } from "next";
import Link from "next/link";

import { createPublicClient } from "@/lib/supabase/public";
import type { Reliability, ScorelinesCache } from "@/lib/sync/scorelines";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Scoreline probabilities",
  description:
    "Exact chances of every set score, tiebreaks and total games for any tennis match, from the rating model played out point by point, and checked against 47,000 real results.",
};

const TOURS = [
  { key: "atp", label: "ATP", color: "var(--chart-line)" },
  { key: "wta", label: "WTA", color: "var(--chart-line-2)" },
] as const;

/** Predicted against actual: dots on the diagonal are perfectly calibrated. */
function Plot({
  title,
  series,
  lo,
  hi,
  unit,
}: {
  title: string;
  series: { label: string; color: string; rows: Reliability[] }[];
  lo: number;
  hi: number;
  unit: (v: number) => string;
}) {
  const S = 220;
  const P = 6;
  const at = (v: number) => P + ((v - lo) / (hi - lo)) * (S - 2 * P);
  const label = series
    .map((s) =>
      s.rows
        .map(
          (r) =>
            `${s.label}: predicted ${unit(r.predicted)}, actual ${unit(r.actual)} (${r.matches} matches)`,
        )
        .join("; "),
    )
    .join(". ");
  return (
    <figure className="space-y-2 rounded-xl border border-border bg-surface p-4">
      <figcaption className="text-sm font-semibold">{title}</figcaption>
      <div className="flex gap-2">
        <div
          className="flex flex-col justify-between py-1 text-[11px] text-muted tabular-nums"
          aria-hidden
        >
          <span>{unit(hi)}</span>
          <span>{unit(lo)}</span>
        </div>
        <svg
          viewBox={`0 0 ${S} ${S}`}
          className="aspect-square w-full max-w-[16rem]"
          role="img"
          aria-label={`${title}. ${label}`}
        >
          <rect
            x={P}
            y={P}
            width={S - 2 * P}
            height={S - 2 * P}
            fill="none"
            stroke="var(--border)"
          />
          <line
            x1={at(lo)}
            y1={S - at(lo)}
            x2={at(hi)}
            y2={S - at(hi)}
            stroke="var(--muted)"
            strokeDasharray="4 3"
          />
          {series.map((s) =>
            s.rows.map((r) => (
              <circle
                key={`${s.label}-${r.predicted}`}
                cx={at(r.predicted)}
                cy={S - at(r.actual)}
                r={Math.min(9, 3 + Math.sqrt(r.matches) / 20)}
                fill={s.color}
                fillOpacity={0.85}
                stroke="var(--surface)"
                strokeWidth={1.5}
              >
                <title>{`${s.label}: predicted ${unit(r.predicted)}, actual ${unit(r.actual)} (${r.matches.toLocaleString("en-US")} matches)`}</title>
              </circle>
            )),
          )}
        </svg>
      </div>
      <p className="text-[11px] text-muted">
        Across: predicted ({unit(lo)}–{unit(hi)}). Up: what happened. Dashed:
        perfect.
      </p>
    </figure>
  );
}

export default async function ScorelinesPage() {
  const { data: row } = await createPublicClient()
    .from("stat_cache")
    .select("data")
    .eq("key", "lab:scorelines")
    .maybeSingle();
  const d = row?.data as unknown as ScorelinesCache | undefined;
  const atp = d?.tours.atp;
  const wta = d?.tours.wta;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const games = (v: number) => `${Math.round(v)}`;

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Scoreline probabilities
        </h1>
        <p className="text-sm text-muted">
          Every match page now shows the chance of each set score, a tiebreak
          and the total games. They come from the model’s win chance, played out
          point by point: each player’s serve is set so the match chance comes
          out right, and the match is solved exactly through games, tiebreaks
          and sets. Here is how well that matches reality.
        </p>
      </div>

      {!atp || !wta ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
          Checked weekly; check back soon.
        </p>
      ) : (
        <>
          <section
            aria-labelledby="form-heading"
            className="max-w-2xl space-y-2"
          >
            <h2
              id="form-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted"
            >
              The fix that mattered: form on the day
            </h2>
            <p className="text-sm">
              Played point by point with fixed serve strengths, sets come out
              too even: straight-set wins happened far more often than that
              predicted. Real matches are more lopsided because a player’s level
              on the day varies. Letting the gap between the two players vary
              from match to match (while keeping the same overall win chance)
              fixed it: the straight-sets, tiebreak and total-games predictions
              below now land on the diagonal, and the log loss of the exact set
              score fell from {atp.flatLogLoss.toFixed(3)} to{" "}
              {atp.logLoss.toFixed(3)} (ATP) and from{" "}
              {wta.flatLogLoss.toFixed(3)} to {wta.logLoss.toFixed(3)} (WTA),
              against {atp.baseline.toFixed(3)} and {wta.baseline.toFixed(3)}{" "}
              for knowing only how often each score happens.
            </p>
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            <Plot
              title="Straight-sets win"
              lo={0.3}
              hi={0.9}
              unit={pct}
              series={TOURS.map((t) => ({
                label: t.label,
                color: t.color,
                rows: d!.tours[t.key].straight,
              }))}
            />
            <Plot
              title="At least one tiebreak"
              lo={0.1}
              hi={0.6}
              unit={pct}
              series={TOURS.map((t) => ({
                label: t.label,
                color: t.color,
                rows: d!.tours[t.key].tiebreak,
              }))}
            />
            <Plot
              title="Total games (best of 3)"
              lo={18}
              hi={26}
              unit={games}
              series={TOURS.map((t) => ({
                label: t.label,
                color: t.color,
                rows: d!.tours[t.key].games.filter((r) => r.predicted < 30),
              }))}
            />
          </div>
          <ul className="flex gap-4 text-xs text-muted" aria-label="Legend">
            {TOURS.map((t) => (
              <li key={t.key} className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: t.color }}
                  aria-hidden
                />
                {t.label}
              </li>
            ))}
            <li>Bigger dots: more matches.</li>
          </ul>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">
                Scoreline model checks by tour
              </caption>
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Check
                  </th>
                  {TOURS.map((t) => (
                    <th
                      key={t.key}
                      scope="col"
                      className="px-3 py-2 text-right font-medium"
                    >
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  {
                    label: "Completed matches checked",
                    f: (t: typeof atp) => t.matches.toLocaleString("en-US"),
                  },
                  {
                    label: "Likeliest set score was right",
                    f: (t: typeof atp) => pct(t.topHit),
                  },
                  {
                    label: "Tiebreak in the match: predicted / actual",
                    f: (t: typeof atp) =>
                      `${pct(t.tuning.find((x) => x.average === t.average)?.tiebreak ?? 0)} / ${pct(t.actualTiebreak)}`,
                  },
                  {
                    label: "Games per match: predicted / actual",
                    f: (t: typeof atp) =>
                      `${(t.tuning.find((x) => x.average === t.average)?.games ?? 0).toFixed(1)} / ${t.actualGames.toFixed(1)}`,
                  },
                  {
                    label:
                      "Set-score log loss: with form / without / tour frequencies",
                    f: (t: typeof atp) =>
                      `${t.logLoss.toFixed(3)} / ${t.flatLogLoss.toFixed(3)} / ${t.baseline.toFixed(3)}`,
                  },
                  {
                    label: "Serve average and form spread (tuned)",
                    f: (t: typeof atp) => `${t.average.toFixed(2)} · ${t.tau}`,
                  },
                ].map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      {r.label}
                    </th>
                    <td className="px-3 py-2 text-right">{r.f(atp)}</td>
                    <td className="px-3 py-2 text-right">{r.f(wta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted">
            Completed matches since 2016 with a regular scoreline (no
            retirements, no match tiebreak in place of a final set). The serve
            average sets how often sets reach a tiebreak and is tuned to the
            tiebreak rate; the form spread is tuned to the exact set scores.
            Re-checked weekly. Estimates, not betting advice.
          </p>
        </>
      )}
    </div>
  );
}
