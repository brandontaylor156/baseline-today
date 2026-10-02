import { Flag } from "@/components/flag";

export interface TitleHistorySeries {
  key: string;
  name: string;
  countryCode: string | null;
  points: { at: string; p: number }[];
}

const W = 160;
const H = 40;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

/** Small multiples: one sparkline per contender, all on the same 0–max scale and time axis. */
export function TitleHistory({ series, times }: { series: TitleHistorySeries[]; times: string[] }) {
  if (series.length === 0 || times.length < 2) return null;
  const max = Math.max(0.05, ...series.flatMap((s) => s.points.map((x) => x.p)));
  const t0 = Date.parse(times[0]);
  const t1 = Date.parse(times.at(-1)!);
  const x = (at: string) => (t1 === t0 ? W : ((Date.parse(at) - t0) / (t1 - t0)) * (W - 4) + 2);
  const y = (p: number) => H - 3 - (p / max) * (H - 6);

  return (
    <section aria-labelledby="history-heading" className="space-y-2">
      <h2 id="history-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
        How the title chances moved
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {series.map((s) => {
          const first = s.points[0];
          const last = s.points.at(-1)!;
          const path = s.points.map((pt, i) => `${i ? "L" : "M"}${x(pt.at).toFixed(1)},${y(pt.p).toFixed(1)}`).join(" ");
          return (
            <li key={s.key} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm">
                  <Flag code={s.countryCode} reserve />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="text-xs tabular-nums text-muted">
                  {pct(first.p)} → <span className="font-semibold text-foreground">{pct(last.p)}</span>
                </span>
              </span>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="h-10 w-32 shrink-0 overflow-visible"
                role="img"
                aria-label={`${s.name}: title chance from ${pct(first.p)} to ${pct(last.p)}`}
              >
                <line x1="0" x2={W} y1={H - 3} y2={H - 3} className="stroke-border" strokeWidth="1" />
                <path d={path} fill="none" className="stroke-chart-line" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {s.points.map((pt) => (
                  <circle key={pt.at} cx={x(pt.at)} cy={y(pt.p)} r="6" className="fill-transparent">
                    <title>{`${when(pt.at)}: ${pct(pt.p)}`}</title>
                  </circle>
                ))}
                <circle cx={x(last.at)} cy={y(last.p)} r="2.5" className="fill-chart-line" />
              </svg>
            </li>
          );
        })}
      </ul>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted hover:text-foreground">Show as table</summary>
        <div className="mt-2 overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-xs">
            <caption className="sr-only">Title chance after each update</caption>
            <thead className="border-b border-border text-left text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Updated
                </th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">
                    {s.name.split(" ").at(-1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {times.map((at) => (
                <tr key={at}>
                  <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-normal text-muted">
                    {when(at)}
                  </th>
                  {series.map((s) => {
                    const pt = s.points.find((x) => x.at === at);
                    return (
                      <td key={s.key} className="px-2 py-1.5 text-right tabular-nums">
                        {pt ? pct(pt.p) : "–"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
