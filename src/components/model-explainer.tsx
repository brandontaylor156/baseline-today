import Link from "next/link";

import type { ModelExplain } from "@/lib/data/match-preview";

const pct = (p: number) => `${Math.round(p * 100)}%`;
const SURFACE: Record<string, string> = { hard: "hard courts", clay: "clay", grass: "grass" };

/** Step by step: the two ratings, the chances they give, the blend, calibration, and the result. */
export function ModelExplainer({ e, nameA, nameB }: { e: ModelExplain; nameA: string; nameB: string }) {
  const last = (n: string) => n.split(" ").at(-1);
  const rows: { label: string; a: string; b: string }[] = [
    { label: "Overall rating", a: Math.round(e.a.overall).toString(), b: Math.round(e.b.overall).toString() },
    ...(e.surface && e.a.onSurface !== null && e.b.onSurface !== null
      ? [{ label: `Rating on ${SURFACE[e.surface]}`, a: Math.round(e.a.onSurface).toString(), b: Math.round(e.b.onSurface).toString() }]
      : []),
    { label: "Matches behind it", a: e.a.matches.toLocaleString("en-US"), b: e.b.matches.toLocaleString("en-US") },
  ];
  const steps = [
    { label: "From overall ratings", p: e.overallP },
    ...(e.surfaceP !== null ? [{ label: `From ratings on ${SURFACE[e.surface!]}`, p: e.surfaceP }] : []),
    ...(e.surfaceP !== null ? [{ label: "Blended half and half", p: e.blendedP }] : []),
    { label: e.fiveSets ? "Calibrated, then adjusted for best of five sets" : "Calibrated (pulled toward 50%)", p: e.finalP },
  ];

  return (
    <section aria-labelledby="why-heading" className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 id="why-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
        Why the model says {pct(e.finalP)}–{pct(1 - e.finalP)}
      </h2>
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">Model inputs for both players</caption>
        <thead className="text-xs text-muted">
          <tr>
            <th scope="col" className="py-1 text-left font-medium">
              <span className="sr-only">Input</span>
            </th>
            <th scope="col" className="py-1 text-right font-medium">{last(nameA)}</th>
            <th scope="col" className="py-1 text-right font-medium">{last(nameB)}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="py-1.5 text-left font-normal text-muted">{r.label}</th>
              <td className="py-1.5 text-right">{r.a}</td>
              <td className="py-1.5 text-right">{r.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="space-y-1.5 text-sm">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1">{s.label}</span>
            <span className={`shrink-0 tabular-nums ${i === steps.length - 1 ? "font-semibold" : ""}`}>
              {last(nameA)} {pct(s.p)}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">
        A 100-point rating gap is about a 64% chance before calibration. The model uses only results: form and the head-to-head
        below are shown for context, not added in. Ratings move after every match.{" "}
        <Link href="/model" className="underline underline-offset-2">
          How accurate is it?
        </Link>
      </p>
    </section>
  );
}
