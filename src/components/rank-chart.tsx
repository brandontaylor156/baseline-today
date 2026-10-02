"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { formatDate, formatPoints } from "@/lib/format";
import { monthTicks, nearestIndex, rankDomain, rankTicks, segments, type RankPoint } from "@/lib/rank-chart";

const HEIGHT = 220;
const M = { top: 14, right: 44, bottom: 26, left: 40 };
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

const t = (date: string) => Date.parse(`${date}T00:00:00Z`);

/**
 * Weekly rank over time, rank 1 at the top. One series (no legend; the heading names it),
 * broken where the player was outside the top 100. Crosshair + tooltip on hover, arrow keys
 * when focused, and a table view for screen readers and print.
 */
export function RankChart({ history, tourDates, tourLabel }: { history: RankPoint[]; tourDates: string[]; tourLabel: string }) {
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

  const points = useMemo(() => [...history].sort((a, b) => a.date.localeCompare(b.date)), [history]);
  const runs = useMemo(() => segments(points, tourDates), [points, tourDates]);
  if (points.length < 2) return null;

  const first = points[0].date;
  const last = points.at(-1)!.date;
  const domain = rankDomain(points);
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const x = (date: string) => M.left + ((t(date) - t(first)) / Math.max(1, t(last) - t(first))) * innerW;
  const y = (rank: number) => M.top + ((rank - domain[0]) / Math.max(1, domain[1] - domain[0])) * innerH;
  const months = monthTicks(first, last, width < 480 ? 4 : 6);
  const end = points.at(-1)!;
  const shown = active === null ? null : points[active];

  function onPointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const time = t(first) + ((px - M.left) / innerW) * (t(last) - t(first));
    setActive(nearestIndex(points, time));
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

  const tipLeft = shown ? Math.min(Math.max(x(shown.date) - 70, 4), width - 144) : 0;

  return (
    <div ref={boxRef} className="relative">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`${tourLabel} rank by week from ${formatDate(first)} to ${formatDate(last)}. Use left and right arrow keys to read values.`}
        aria-describedby={tableId}
        tabIndex={0}
        onPointerMove={onPointer}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        className="block touch-pan-y outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {/* Recessive grid and rank axis */}
        {rankTicks(domain).map((r) => (
          <g key={r}>
            <line x1={M.left} x2={width - M.right} y1={y(r)} y2={y(r)} stroke="var(--border)" strokeWidth={1} />
            <text x={M.left - 8} y={y(r)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              #{r}
            </text>
          </g>
        ))}
        {months.map((m, i) => (
          <text key={m} x={x(m)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted text-[11px]">
            {/* Full year on the first tick and whenever the year changes. */}
            {i === 0 || m.slice(0, 4) !== months[i - 1].slice(0, 4) ? MONTH_YEAR.format(new Date(t(m))) : MONTH.format(new Date(t(m)))}
          </text>
        ))}

        {/* Series: 2px line, round joins, one path per continuous run */}
        {runs.map((run) =>
          run.length > 1 ? (
            <path
              key={run[0].date}
              d={run.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.rank).toFixed(1)}`).join("")}
              fill="none"
              stroke="var(--chart-line)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : (
            <circle key={run[0].date} cx={x(run[0].date)} cy={y(run[0].rank)} r={2.5} fill="var(--chart-line)" />
          ),
        )}

        {/* End marker with surface ring and a single direct label */}
        <circle cx={x(end.date)} cy={y(end.rank)} r={4} fill="var(--chart-line)" stroke="var(--surface)" strokeWidth={2} />
        <text x={x(end.date) + 8} y={y(end.rank)} dy="0.32em" className="fill-foreground text-xs font-semibold tabular-nums">
          #{end.rank}
        </text>

        {/* Crosshair */}
        {shown && (
          <g pointerEvents="none">
            <line x1={x(shown.date)} x2={x(shown.date)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--muted)" strokeWidth={1} />
            <circle cx={x(shown.date)} cy={y(shown.rank)} r={5} fill="var(--chart-line)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>

      {shown && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 w-36 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: tipLeft }}
        >
          <div className="text-muted">{formatDate(shown.date)}</div>
          <div className="font-semibold tabular-nums">
            #{shown.rank}
            <span className="font-normal text-muted"> · {formatPoints(shown.points)} pts</span>
          </div>
        </div>
      )}

      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer select-none hover:text-foreground">Show as table</summary>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table id={tableId} className="w-full text-left tabular-nums">
            <caption className="sr-only">{tourLabel} rank by week</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 font-medium">Week</th>
                <th scope="col" className="py-1 text-right font-medium">Rank</th>
                <th scope="col" className="py-1 text-right font-medium">Points</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.date} className="border-t border-border">
                  <td className="py-1">{formatDate(p.date)}</td>
                  <td className="py-1 text-right text-foreground">#{p.rank}</td>
                  <td className="py-1 text-right">{formatPoints(p.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
