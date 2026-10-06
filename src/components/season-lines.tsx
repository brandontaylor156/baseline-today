"use client";

import { useEffect, useId, useRef, useState } from "react";

const HEIGHT = 220;
const M = { top: 14, right: 40, bottom: 26, left: 40 };
const COLORS = ["var(--chart-line)", "var(--chart-line-2)"];

export interface SeasonSeries {
  name: string;
  /** Value (0–1) per season; missing seasons are gaps. */
  points: { season: number; value: number; n: number }[];
}

/**
 * Up to two series of rates by season (e.g. ATP and WTA accuracy). Legend, direct end labels,
 * crosshair tooltip on hover, arrow keys when focused, and a table view.
 */
export function SeasonLines({ series, label, format = (v) => `${(v * 100).toFixed(1)}%` }: { series: SeasonSeries[]; label: string; format?: (v: number) => string }) {
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

  const seasons = [...new Set(series.flatMap((s) => s.points.map((p) => p.season)))].sort((a, b) => a - b);
  if (seasons.length < 2) return null;
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  const lo = Math.floor(Math.min(...values) * 50) / 50;
  const hi = Math.ceil(Math.max(...values) * 50) / 50;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += 0.02) ticks.push(Math.round(v * 100) / 100);
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const x = (s: number) => M.left + ((s - seasons[0]) / (seasons.at(-1)! - seasons[0])) * innerW;
  const y = (v: number) => M.top + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * innerH;
  const at = (s: SeasonSeries, season: number) => s.points.find((p) => p.season === season);
  const shown = active === null ? null : seasons[active];
  const every = width < 480 ? 2 : 1;

  return (
    <div ref={boxRef} className="relative">
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
          {series.map((s, i) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: COLORS[i] }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`${label}. Use left and right arrow keys to read values.`}
        aria-describedby={tableId}
        tabIndex={0}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * width;
          const s = seasons[0] + ((px - M.left) / innerW) * (seasons.at(-1)! - seasons[0]);
          setActive(Math.min(seasons.length - 1, Math.max(0, Math.round(s - seasons[0]))));
        }}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setActive((i) => Math.min(seasons.length - 1, Math.max(0, (i ?? seasons.length - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
        }}
        className="block touch-pan-y outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        {seasons.map((s, i) =>
          i % every === 0 || i === seasons.length - 1 ? (
            <text key={s} x={x(s)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted text-[11px] tabular-nums">
              {width < 480 ? `’${String(s).slice(2)}` : s}
            </text>
          ) : null,
        )}
        {series.map((s, i) => {
          const pts = [...s.points].sort((a, b) => a.season - b.season);
          const end = pts.at(-1);
          return (
            <g key={s.name}>
              <path
                d={pts.map((p, j) => `${j ? "L" : "M"}${x(p.season).toFixed(1)},${y(p.value).toFixed(1)}`).join("")}
                fill="none"
                stroke={COLORS[i]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {end && (
                <>
                  <circle cx={x(end.season)} cy={y(end.value)} r={4} fill={COLORS[i]} stroke="var(--surface)" strokeWidth={2} />
                  <text x={x(end.season) + 7} y={y(end.value)} dy="0.32em" className="fill-foreground text-[11px] font-semibold">
                    {s.name}
                  </text>
                </>
              )}
            </g>
          );
        })}
        {shown !== null && (
          <g pointerEvents="none">
            <line x1={x(shown)} x2={x(shown)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--muted)" strokeWidth={1} />
            {series.map((s, i) => {
              const p = at(s, shown);
              return p ? <circle key={s.name} cx={x(shown)} cy={y(p.value)} r={5} fill={COLORS[i]} stroke="var(--surface)" strokeWidth={2} /> : null;
            })}
          </g>
        )}
      </svg>
      {shown !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-6 w-44 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: Math.min(Math.max(x(shown) - 88, 4), width - 180) }}
        >
          <div className="text-muted">{shown}</div>
          {series.map((s, i) => {
            const p = at(s, shown);
            return (
              <div key={s.name} className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: COLORS[i] }} />
                <span className="truncate">{s.name}</span>
                <span className="ml-auto font-semibold tabular-nums">{p ? format(p.value) : "–"}</span>
              </div>
            );
          })}
        </div>
      )}
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer select-none hover:text-foreground">Show as table</summary>
        <table id={tableId} className="mt-2 w-full text-left tabular-nums">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 font-medium">Season</th>
              {series.map((s) => (
                <th key={s.name} scope="col" className="py-1 text-right font-medium">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...seasons].reverse().map((season) => (
              <tr key={season} className="border-t border-border">
                <td className="py-1">{season}</td>
                {series.map((s) => {
                  const p = at(s, season);
                  return (
                    <td key={s.name} className="py-1 text-right text-foreground">
                      {p ? `${format(p.value)} (${p.n.toLocaleString("en-US")})` : "–"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
