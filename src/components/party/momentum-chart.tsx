const W = 640;
const H = 140;
const M = { top: 10, right: 40, bottom: 18, left: 34 };
const pct = (p: number) => `${Math.round(p * 100)}%`;

/** Win chance of player A after every point: above the midline A is ahead, below B is. */
export function MomentumChart({ line, nameA, nameB }: { line: number[]; nameA: string; nameB: string }) {
  if (line.length < 2) return null;
  const x = (i: number) => M.left + (i / (line.length - 1)) * (W - M.left - M.right);
  const y = (p: number) => M.top + (1 - p) * (H - M.top - M.bottom);
  const path = line.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join("");
  const last = line.at(-1)!;
  const swing = line.reduce((best, p, i) => (i > 0 && Math.abs(p - line[i - 1]) > best.d ? { d: Math.abs(p - line[i - 1]), i } : best), { d: 0, i: 0 });

  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${nameA}'s win chance through the match, now ${pct(last)}; ${line.length - 1} points played`}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={v === 0.5 ? "4 4" : undefined} />
            <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px]">
              {pct(v)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--chart-line)" strokeWidth={2} strokeLinejoin="round" />
        {swing.d > 0.05 && <circle cx={x(swing.i)} cy={y(line[swing.i])} r={4} fill="none" stroke="var(--foreground)" strokeWidth={1.5} />}
        <circle cx={x(line.length - 1)} cy={y(last)} r={4} fill="var(--chart-line)" stroke="var(--surface)" strokeWidth={2} />
        <text x={x(line.length - 1) + 7} y={y(last)} dy="0.32em" className="fill-foreground text-xs font-semibold">
          {pct(last)}
        </text>
      </svg>
      <figcaption className="text-xs text-muted">
        {nameA}’s chance to win, point by point (above the dashed line: {nameA} ahead; below: {nameB}).
        {swing.d > 0.05 ? ` Circled: the biggest swing, ${pct(swing.d)} on one point.` : ""}
      </figcaption>
    </figure>
  );
}
