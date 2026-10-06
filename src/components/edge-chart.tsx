"use client";

import { useEffect, useId, useRef, useState } from "react";

import { formatDate } from "@/lib/format";
import { monthTicks } from "@/lib/rank-chart";

const HEIGHT = 200;
const M = { top: 14, right: 44, bottom: 26, left: 40 };
const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const t = (date: string) => Date.parse(`${date}T00:00:00Z`);
const pct = (p: number) => `${Math.round(p * 100)}%`;

export interface Meeting {
  date: string;
  /** True when player A won. */
  aWon: boolean;
  label: string;
}

/**
 * A's chance against B week by week (one series: the heading names it), a 50% line, and dots on
 * the line where they actually met (filled when A won). Crosshair, arrow keys and a table view.
 */
export function EdgeChart({ points, meetings, nameA, nameB }: { points: { week: string; p: number }[]; meetings: Meeting[]; nameA: string; nameB: string }) {
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
  if (points.length < 2) return null;

  const first = points[0].week;
  const last = points.at(-1)!.week;
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const x = (d: string) => M.left + ((t(d) - t(first)) / Math.max(1, t(last) - t(first))) * innerW;
  const y = (p: number) => M.top + (1 - p) * innerH;
  // The edge at a date: the latest point on or before it.
  const at = (d: string) => [...points].reverse().find((p) => p.week <= d)?.p ?? points[0].p;
  const shown = active === null ? null : points[active];
  const end = points.at(-1)!;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.week).toFixed(1)},${y(p.p).toFixed(1)}`).join("");
  const inRange = meetings.filter((m) => m.date >= first && m.date <= last);

  return (
    <div ref={boxRef} className="relative">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`${nameA}'s chance against ${nameB} by week, now ${pct(end.p)}; dots mark their meetings. Use left and right arrow keys to read values.`}
        aria-describedby={tableId}
        tabIndex={0}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * width;
          const time = t(first) + ((px - M.left) / innerW) * (t(last) - t(first));
          let best = 0;
          points.forEach((p, i) => {
            if (Math.abs(t(p.week) - time) < Math.abs(t(points[best].week) - time)) best = i;
          });
          setActive(best);
        }}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setActive((i) => Math.min(points.length - 1, Math.max(0, (i ?? points.length - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
        }}
        className="block touch-pan-y outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} strokeDasharray={v === 0.5 ? "4 3" : undefined} />
            <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {pct(v)}
            </text>
          </g>
        ))}
        {monthTicks(first, last, width < 480 ? 3 : 5).map((m) => (
          <text key={m} x={x(m)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted text-[11px]">
            {MONTH_YEAR.format(new Date(t(m)))}
          </text>
        ))}
        <path d={path} fill="none" stroke="var(--chart-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {inRange.map((m, i) => (
          <circle key={i} cx={x(m.date)} cy={y(at(m.date))} r={4.5} fill={m.aWon ? "var(--chart-line)" : "var(--surface)"} stroke="var(--chart-line)" strokeWidth={2}>
            <title>{`${formatDate(m.date)}: ${m.aWon ? nameA : nameB} won (${m.label})`}</title>
          </circle>
        ))}
        <text x={x(end.week) + 7} y={y(end.p)} dy="0.32em" className="fill-foreground text-xs font-semibold tabular-nums">
          {pct(end.p)}
        </text>
        {shown && <line x1={x(shown.week)} x2={x(shown.week)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--muted)" strokeWidth={1} pointerEvents="none" />}
      </svg>
      {shown && (
        <div role="status" className="pointer-events-none absolute top-0 w-40 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md" style={{ left: Math.min(Math.max(x(shown.week) - 80, 4), width - 164) }}>
          <div className="text-muted">Week of {formatDate(shown.week)}</div>
          <div className="font-semibold tabular-nums">
            {nameA.split(" ").at(-1)} {pct(shown.p)}
          </div>
        </div>
      )}
      <p className="mt-1 text-xs text-muted">Filled dots: {nameA} won that meeting; open dots: {nameB} won.</p>
      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer select-none hover:text-foreground">Show as table</summary>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table id={tableId} className="w-full text-left tabular-nums">
            <caption className="sr-only">{nameA}&apos;s chance against {nameB} by week</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 font-medium">Week of</th>
                <th scope="col" className="py-1 text-right font-medium">{nameA.split(" ").at(-1)}</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.week} className="border-t border-border">
                  <td className="py-1">{formatDate(p.week)}</td>
                  <td className="py-1 text-right text-foreground">{pct(p.p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
