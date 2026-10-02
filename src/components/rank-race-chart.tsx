"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { formatDate } from "@/lib/format";
import { monthTicks, rankDomain, rankTicks, segments, type RankPoint } from "@/lib/rank-chart";

const HEIGHT = 240;
const M = { top: 14, right: 16, bottom: 26, left: 40 };
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const t = (date: string) => Date.parse(`${date}T00:00:00Z`);

interface Series {
  name: string;
  history: RankPoint[];
  color: string;
}

/**
 * Two players' weekly ranks on one chart (rank 1 on top). Legend + crosshair tooltip with both
 * ranks; arrow keys move the crosshair; table view for screen readers.
 */
export function RankRaceChart({ a, b, tourDates }: { a: { name: string; history: RankPoint[] }; b: { name: string; history: RankPoint[] }; tourDates: string[] }) {
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

  const series: Series[] = useMemo(
    () => [
      { name: a.name, history: a.history, color: "var(--chart-line)" },
      { name: b.name, history: b.history, color: "var(--chart-line-2)" },
    ],
    [a, b],
  );
  const dates = useMemo(() => [...new Set([...a.history, ...b.history].map((p) => p.date))].sort(), [a, b]);
  const rankAt = useMemo(() => series.map((s) => new Map(s.history.map((p) => [p.date, p.rank]))), [series]);
  if (dates.length < 2) return null;

  const first = dates[0];
  const last = dates.at(-1)!;
  const domain = rankDomain([...a.history, ...b.history]);
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const x = (d: string) => M.left + ((t(d) - t(first)) / Math.max(1, t(last) - t(first))) * innerW;
  const y = (r: number) => M.top + ((r - domain[0]) / Math.max(1, domain[1] - domain[0])) * innerH;
  const months = monthTicks(first, last, width < 480 ? 4 : 6);
  const shown = active === null ? null : dates[active];

  function onPointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const time = t(first) + ((px - M.left) / innerW) * (t(last) - t(first));
    let best = 0;
    dates.forEach((d, i) => {
      if (Math.abs(t(d) - time) < Math.abs(t(dates[best]) - time)) best = i;
    });
    setActive(best);
  }

  return (
    <div ref={boxRef} className="relative">
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Weekly rank of ${a.name} and ${b.name}. Use left and right arrow keys to read values.`}
        aria-describedby={tableId}
        tabIndex={0}
        onPointerMove={onPointer}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const step = e.key === "ArrowLeft" ? -1 : 1;
          setActive((i) => Math.min(dates.length - 1, Math.max(0, (i ?? dates.length - 1) + step)));
        }}
        className="block touch-pan-y outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-accent/40"
      >
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
            {i === 0 || m.slice(0, 4) !== months[i - 1].slice(0, 4) ? MONTH_YEAR.format(new Date(t(m))) : MONTH.format(new Date(t(m)))}
          </text>
        ))}
        {series.map((s) =>
          segments(s.history, tourDates).map((run) =>
            run.length > 1 ? (
              <path
                key={`${s.name}-${run[0].date}`}
                d={run.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.rank).toFixed(1)}`).join("")}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : (
              <circle key={`${s.name}-${run[0].date}`} cx={x(run[0].date)} cy={y(run[0].rank)} r={2.5} fill={s.color} />
            ),
          ),
        )}
        {series.map((s) => {
          const end = s.history.at(-1);
          return end ? <circle key={s.name} cx={x(end.date)} cy={y(end.rank)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} /> : null;
        })}
        {shown && (
          <g pointerEvents="none">
            <line x1={x(shown)} x2={x(shown)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--muted)" strokeWidth={1} />
            {series.map((s, i) => {
              const r = rankAt[i].get(shown);
              return r ? <circle key={s.name} cx={x(shown)} cy={y(r)} r={5} fill={s.color} stroke="var(--surface)" strokeWidth={2} /> : null;
            })}
          </g>
        )}
      </svg>
      {shown && (
        <div
          role="status"
          className="pointer-events-none absolute top-6 w-44 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: Math.min(Math.max(x(shown) - 88, 4), width - 180) }}
        >
          <div className="text-muted">{formatDate(shown)}</div>
          {series.map((s, i) => (
            <div key={s.name} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.name}</span>
              <span className="ml-auto font-semibold tabular-nums">{rankAt[i].get(shown) ? `#${rankAt[i].get(shown)}` : "–"}</span>
            </div>
          ))}
        </div>
      )}
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer select-none hover:text-foreground">Show as table</summary>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table id={tableId} className="w-full text-left tabular-nums">
            <caption className="sr-only">Weekly ranks</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 font-medium">Week</th>
                {series.map((s) => (
                  <th key={s.name} scope="col" className="py-1 text-right font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...dates].reverse().map((d) => (
                <tr key={d} className="border-t border-border">
                  <td className="py-1">{formatDate(d)}</td>
                  {rankAt.map((m, i) => (
                    <td key={i} className="py-1 text-right text-foreground">
                      {m.get(d) ? `#${m.get(d)}` : "–"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
