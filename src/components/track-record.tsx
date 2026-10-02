import Link from "next/link";

import type { Call, TrackRecord } from "@/lib/track-record";

const pct = (p: number) => `${Math.round(p * 100)}%`;
const rank = (r: number | null) => (r ? `#${r}` : "unranked");

function Who({ id, name }: { id: number | null; name: string }) {
  return id !== null ? (
    <Link href={`/players/${id}`} className="hover:underline">
      {name}
    </Link>
  ) : (
    <>{name}</>
  );
}

function CallRow({ c, note }: { c: Call; note: string }) {
  const pick = c.pick === 1 ? c.match.p1 : c.match.p2;
  const other = c.pick === 1 ? c.match.p2 : c.match.p1;
  return (
    <li className="py-2">
      <span className="block truncate">
        <Who id={pick.id} name={pick.name} /> <span className="text-muted">({rank(pick.rank)}) vs</span> <Who id={other.id} name={other.name} />{" "}
        <span className="text-muted">({rank(other.rank)})</span>
      </span>
      <span className="block truncate text-xs text-muted">
        {note.replace("{p}", pct(c.chance))} · {c.match.tournament}
        {c.match.round ? `, ${c.match.round}` : ""}
      </span>
    </li>
  );
}

/** The model's record on this week's results, its calls against the ranking, and its misses. */
export function TrackRecordSection({ record }: { record: TrackRecord }) {
  if (record.total === 0) return null;
  return (
    <section aria-labelledby="track-heading" className="space-y-2">
      <h2 id="track-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
        This week’s track record
      </h2>
      <p className="text-sm">
        The model’s favorite won <strong className="tabular-nums">{record.correct}</strong> of{" "}
        <strong className="tabular-nums">{record.total}</strong> matches ({pct(record.correct / record.total)}) at tournaments played in the last 7 days.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-border bg-surface px-4 py-2">
          <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Beat the ranking</h3>
          {record.beatRanking.length === 0 ? (
            <p className="py-2 text-sm text-muted">No wins for a lower-ranked pick this week.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {record.beatRanking.map((c) => (
                <CallRow key={c.match.id} c={c} note="Model gave them {p} as the lower-ranked player; they won" />
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0 rounded-xl border border-border bg-surface px-4 py-2">
          <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Biggest misses</h3>
          {record.misses.length === 0 ? (
            <p className="py-2 text-sm text-muted">No misses this week.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {record.misses.map((c) => (
                <CallRow key={c.match.id} c={c} note="Model gave them {p}; they lost" />
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="text-xs text-muted">Pre-match chances are recalculated daily, so the newest results join the record within a day.</p>
    </section>
  );
}
