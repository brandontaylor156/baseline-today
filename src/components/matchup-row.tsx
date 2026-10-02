import Link from "next/link";

import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";
import type { Matchup, Side } from "@/lib/data/predictions";
import { formatAmerican } from "@/lib/model/odds";

const pct = (p: number) => `${Math.round(p * 100)}%`;

function Name({ side }: { side: Side }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Flag code={side.countryCode} reserve />
      {side.id !== null ? (
        <Link href={`/players/${side.id}`} className="truncate hover:underline">
          {side.name}
        </Link>
      ) : (
        <span className="truncate">{side.name}</span>
      )}
      {side.rank && <span className="shrink-0 text-xs text-muted">#{side.rank}</span>}
    </span>
  );
}

function ProbabilityBar({ p }: { p: number }) {
  return (
    <span aria-hidden className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
      <span className="bg-chart-line" style={{ width: `${p * 100}%` }} />
    </span>
  );
}

export function MatchupRow({ m }: { m: Matchup }) {
  const thin = m.minMatches < 10;
  return (
    <li className="space-y-1.5 px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>{m.round ?? ""}</span>
        <span>{m.scheduledAt ? <LocalTime iso={m.scheduledAt} fallback={null} /> : "Time TBA"}</span>
      </div>
      {[1, 2].map((s) => {
        const side = s === 1 ? m.p1 : m.p2;
        const model = s === 1 ? m.model1 : 1 - m.model1;
        const best = s === 1 ? m.market.best1 : m.market.best2;
        const fair = m.market.fair1 === null ? null : s === 1 ? m.market.fair1 : 1 - m.market.fair1;
        return (
          <div key={s} className="grid grid-cols-[1fr_auto] items-center gap-x-3 sm:grid-cols-[1fr_9rem_7rem]">
            <Name side={side} />
            <span className="flex items-center gap-2 tabular-nums">
              <span className="w-9 text-right font-semibold">{pct(model)}</span>
              <span className="hidden w-16 sm:block">
                <ProbabilityBar p={model} />
              </span>
            </span>
            <span className="col-span-2 text-right text-xs tabular-nums text-muted sm:col-span-1">
              {best ? (
                <>
                  <span className="font-medium text-foreground">{formatAmerican(best.american)}</span> {best.vendor}
                  {fair !== null && <span className="block">market {pct(fair)}</span>}
                </>
              ) : null}
            </span>
          </div>
        );
      })}
      {thin && <p className="text-xs text-muted">Limited match history for one player: model estimate is rough.</p>}
    </li>
  );
}

