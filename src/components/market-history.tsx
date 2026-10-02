const W = 640;
const H = 140;
const M = { top: 12, right: 44, bottom: 22, left: 36 };
const pct = (p: number) => `${Math.round(p * 100)}%`;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

/** How the betting market's chance for one player moved, with the model's chance as a reference line. */
export function MarketHistory({ points, name, model }: { points: { at: string; p: number }[]; name: string; model: number | null }) {
  const t0 = Date.parse(points[0].at);
  const t1 = Date.parse(points.at(-1)!.at);
  const values = [...points.map((p) => p.p), ...(model !== null ? [model] : [])];
  const lo = Math.max(0, Math.floor(Math.min(...values) * 10) / 10 - 0.05);
  const hi = Math.min(1, Math.ceil(Math.max(...values) * 10) / 10 + 0.05);
  const x = (at: string) => M.left + (t1 === t0 ? 0 : ((Date.parse(at) - t0) / (t1 - t0)) * (W - M.left - M.right));
  const y = (p: number) => M.top + (1 - (p - lo) / (hi - lo)) * (H - M.top - M.bottom);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.p).toFixed(1)}`).join("");
  const end = points.at(-1)!;

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface p-4">
      <p className="mb-2 text-xs text-muted">
        Market chance for {name} over time (margin removed){model !== null ? "; dashed line: our model" : ""}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Market chance for ${name} moved from ${pct(points[0].p)} to ${pct(end.p)}`}>
        {[lo, (lo + hi) / 2, hi].map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px]">
              {pct(v)}
            </text>
          </g>
        ))}
        {model !== null && <line x1={M.left} x2={W - M.right} y1={y(model)} y2={y(model)} stroke="var(--muted)" strokeDasharray="4 4" />}
        <path d={path} fill="none" stroke="var(--chart-line)" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p) => (
          <circle key={p.at} cx={x(p.at)} cy={y(p.p)} r={6} fill="transparent">
            <title>{`${when(p.at)}: ${pct(p.p)}`}</title>
          </circle>
        ))}
        <circle cx={x(end.at)} cy={y(end.p)} r={4} fill="var(--chart-line)" stroke="var(--surface)" strokeWidth={2} />
        <text x={x(end.at) + 8} y={y(end.p)} dy="0.32em" className="fill-foreground text-xs font-semibold">
          {pct(end.p)}
        </text>
      </svg>
      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer hover:text-foreground">Show as table</summary>
        <table className="mt-1 w-full tabular-nums">
          <caption className="sr-only">Market chance for {name} by time</caption>
          <tbody>
            {points.map((p) => (
              <tr key={p.at} className="border-t border-border">
                <td className="py-1">{when(p.at)}</td>
                <td className="py-1 text-right text-foreground">{pct(p.p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
