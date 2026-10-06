"use client";

import { useEffect, useRef, useState } from "react";

export interface ComebackSeries {
  label: string;
  color: string;
  points: { event: number; shift: number; low: number; high: number; matches: number }[];
}

const HEIGHT = 240;
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x))}`;
const ordinal = (e: number) => (e === 1 ? "1st" : e === 2 ? "2nd" : e === 3 ? "3rd" : `${e}th`);

/**
 * Rating shift in each event back, one line per layoff length. Measured to its real width (text
 * stays readable on phones); a legend always, end labels when there's room, and a readout on hover
 * or with the arrow keys.
 */
export function ComebackChart({ series }: { series: ComebackSeries[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const wide = width >= 520;
  const M = { top: 12, right: wide ? 130 : 12, bottom: 26, left: 40 };
  const events = series[0]?.points.map((p) => p.event) ?? [];
  const values = series.flatMap((s) => s.points.map((p) => p.shift));
  const lo = Math.floor(Math.min(-60, ...values) / 20) * 20;
  const hi = Math.ceil(Math.max(20, ...values) / 20) * 20;
  const x = (e: number) => M.left + ((e - 1) / Math.max(1, events.length - 1)) * (width - M.left - M.right);
  const y = (v: number) => M.top + ((hi - v) / (hi - lo)) * (HEIGHT - M.top - M.bottom);
  const ticks = Array.from({ length: (hi - lo) / 20 + 1 }, (_, i) => lo + i * 20);

  // End labels: at each line's last value, nudged apart so they never overlap.
  const ends = series
    .map((s, i) => ({ i, y: y(s.points.at(-1)?.shift ?? 0) }))
    .sort((a, b) => a.y - b.y)
    .reduce<{ i: number; y: number }[]>((out, l) => [...out, { ...l, y: Math.max(l.y, (out.at(-1)?.y ?? -Infinity) + 15) }], []);

  return (
    <div ref={boxRef} className="relative">
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        {series.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <svg width="16" height="8" aria-hidden>
              <line x1="0" x2="16" y1="4" y2="4" stroke={s.color} strokeWidth="2" />
              <circle cx="8" cy="4" r="3" fill={s.color} />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label="Rating shift in each event back after a layoff, by length of layoff. Use left and right arrow keys to read values; the table below has them all."
        tabIndex={0}
        className="block h-auto w-full touch-pan-y outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-accent/40"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - rect.left;
          let best = 0;
          events.forEach((ev, i) => {
            if (Math.abs(x(ev) - px) < Math.abs(x(events[best]) - px)) best = i;
          });
          setActive(best);
        }}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setActive((i) => Math.min(events.length - 1, Math.max(0, (i ?? -1) + (e.key === "ArrowLeft" ? -1 : 1))));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={t === 0 ? 1.5 : 1} strokeDasharray={t === 0 ? undefined : "3 3"} />
            <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {t === 0 ? "0" : signed(t)}
            </text>
          </g>
        ))}
        {events.map((ev) => (
          <text key={ev} x={x(ev)} y={HEIGHT - 6} textAnchor={ev === 1 ? "start" : "middle"} className="fill-muted text-[11px]">
            {ev === 1 && wide ? "1st event back" : ordinal(ev)}
          </text>
        ))}
        {active !== null && <line x1={x(events[active])} x2={x(events[active])} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--muted)" strokeWidth={1} pointerEvents="none" />}
        {series.map((s) => (
          <g key={s.label}>
            <path d={s.points.map((p, j) => `${j ? "L" : "M"}${x(p.event).toFixed(1)},${y(p.shift).toFixed(1)}`).join("")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
            {s.points.map((p) => (
              <circle key={p.event} cx={x(p.event)} cy={y(p.shift)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        ))}
        {wide &&
          ends.map((l) => (
            <text key={l.i} x={width - M.right + 10} y={l.y} dy="0.32em" className="fill-foreground text-xs">
              {series[l.i].label}
            </text>
          ))}
      </svg>
      {active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-8 w-48 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: Math.min(Math.max(x(events[active]) - 96, 4), width - 196) }}
        >
          <div className="text-muted">{ordinal(events[active])} event back</div>
          {series.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-2 tabular-nums">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
                {s.label}
              </span>
              <span className="font-semibold">{signed(s.points[active].shift)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
