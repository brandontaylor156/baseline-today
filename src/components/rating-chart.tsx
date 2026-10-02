"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { formatDate } from "@/lib/format";
import { monthTicks } from "@/lib/rank-chart";

const HEIGHT = 200;
const M = { top: 14, right: 48, bottom: 26, left: 44 };
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const t = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** Clean bounds and ticks (every 50, 100 or 200 points) around the ratings shown. */
function scale(values: number[]): { domain: [number, number]; ticks: number[] } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const step = hi - lo > 600 ? 200 : hi - lo > 250 ? 100 : 50;
  const min = Math.floor(lo / step) * step;
  const max = Math.max(min + step, Math.ceil(hi / step) * step);
  const ticks: number[] = [];
  for (let v = min; v <= max; v += step) ticks.push(v);
  return { domain: [min, max], ticks };
}

/**
 * Weekly model (Elo) rating, higher is better. One series, so the heading names it; crosshair and
 * tooltip on hover, arrow keys when focused, and a table view.
 */
export function RatingChart({ history }: { history: { week: string; elo: number }[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = useMemo(() => [...history].sort((a, b) => a.week.localeCompare(b.week)), [history]);
  if (points.length < 2) return null;

  const first = points[0].week;
  const last = points.at(-1)!.week;
  const { domain, ticks } = scale(points.map((p) => p.elo));
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const x = (week: string) => M.left + ((t(week) - t(first)) / Math.max(1, t(last) - t(first))) * innerW;
  const y = (elo: number) => M.top + (1 - (elo - domain[0]) / Math.max(1, domain[1] - domain[0])) * innerH;
  const months = monthTicks(first, last, width < 480 ? 4 : 6);
  const end = points.at(-1)!;
  const shown = active === null ? null : points[active];

  function onPointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const time = t(first) + ((px - M.left) / innerW) * (t(last) - t(first));
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(t(p.week) - time) < Math.abs(t(points[best].week) - time)) best = i;
    });
    setActive(best);
  }

  function onKey(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = e.key === "ArrowLeft" ? -1 : 1;
      setActive((i) => Math.min(points.length - 1, Math.max(0, (i ?? points.length - 1) + step)));
    } else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(points.length - 1);
    else if (e.key === "Escape") setActive(null);
  }

  const tipLeft = shown ? Math.min(Math.max(x(shown.week) - 70, 4), width - 144) : 0;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.week).toFixed(1)},${y(p.elo).toFixed(1)}`).join("");

  return (
    <div ref={boxRef} className="relative">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Model rating by week from ${formatDate(first)} to ${formatDate(last)}, now ${Math.round(end.elo)}. Use left and right arrow keys to read values.`}
        aria-describedby={tableId}
        tabIndex={0}
        onPointerMove={onPointer}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        className="block touch-pan-y outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={M.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {v}
            </text>
          </g>
        ))}
        {months.map((m, i) => (
          <text key={m} x={x(m)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted text-[11px]">
            {i === 0 || m.slice(0, 4) !== months[i - 1].slice(0, 4) ? MONTH_YEAR.format(new Date(t(m))) : MONTH.format(new Date(t(m)))}
          </text>
        ))}
        <path d={path} fill="none" stroke="var(--chart-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(end.week)} cy={y(end.elo)} r={4} fill="var(--chart-line)" stroke="var(--surface)" strokeWidth={2} />
        <text x={x(end.week) + 8} y={y(end.elo)} dy="0.32em" className="fill-foreground text-xs font-semibold tabular-nums">
          {Math.round(end.elo)}
        </text>
        {shown && (
          <g pointerEvents="none">
            <line x1={x(shown.week)} x2={x(shown.week)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--muted)" strokeWidth={1} />
            <circle cx={x(shown.week)} cy={y(shown.elo)} r={5} fill="var(--chart-line)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>

      {shown && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 w-36 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: tipLeft }}
        >
          <div className="text-muted">Week of {formatDate(shown.week)}</div>
          <div className="font-semibold tabular-nums">{Math.round(shown.elo)}</div>
        </div>
      )}

      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer select-none hover:text-foreground">Show as table</summary>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table id={tableId} className="w-full text-left tabular-nums">
            <caption className="sr-only">Model rating by week</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 font-medium">
                  Week of
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Rating
                </th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.week} className="border-t border-border">
                  <td className="py-1">{formatDate(p.week)}</td>
                  <td className="py-1 text-right text-foreground">{Math.round(p.elo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
