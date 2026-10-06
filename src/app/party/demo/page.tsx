import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getMatchPreview } from "@/lib/data/match-preview";
import { getNotableMatchId } from "@/lib/data/notable-match";
import { displayName } from "@/lib/data/tournaments";
import { SCORELINE_PARAMS } from "@/lib/scorelines";
import { IN_MATCH_TAU, setPath } from "@/lib/set-path";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "How watch parties work",
  description: "Watch a live match with friends: call the winner, chat and follow the win chance as it moves. Plus a real recent match, set by set.",
};

const pct = (p: number) => (p >= 1 ? "won" : p <= 0 ? "lost" : `${Math.round(p * 100)}%`);

export default async function WatchPartyInfoPage({ searchParams }: PageProps<"/party/demo">) {
  const { match } = await searchParams;
  // Old links asked for a replay of a specific match: its real page has the set-by-set chances.
  if (typeof match === "string" && /^\d{1,9}$/.test(match)) redirect(`/matches/${match}`);

  const id = await getNotableMatchId();
  const m = id ? await getMatchPreview(id) : null;
  const bestOf: 3 | 5 = m && m.tour === "atp" && /grand slam/i.test(m.category ?? "") ? 5 : 3;
  const sets = m ? m.match.sets.filter((s) => s.p1 !== null && s.p2 !== null && s.p1 !== s.p2) : [];
  const path = m && m.chanceA !== null && sets.length ? setPath(m.chanceA, bestOf, { ...SCORELINE_PARAMS[m.tour], tau: IN_MATCH_TAU[m.tour] }, sets.map((s) => (s.p1! > s.p2! ? 1 : 2))) : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">How watch parties work</h1>
        <p className="text-sm text-muted">
          Open a party for any match that’s about to start or in play, share the link, and follow it together: everyone calls the
          winner, chats, and sees the model’s live win chance move with the real score. Parties need a free account and a real match;
          there’s nothing simulated.
        </p>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Pick a match from Up next or Live scores and choose “Start a watch party”.</li>
        <li>Share the link; friends join with a nickname.</li>
        <li>Call the winner before it starts, then chat as the real score comes in.</li>
      </ol>

      {m && path && (
        <section aria-labelledby="real-heading" className="space-y-2 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <h2 id="real-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            A real recent match, set by set
          </h2>
          <p className="text-sm">
            <Link href={`/matches/${m.match.id}`} className="font-medium hover:underline">
              {m.a.name} vs {m.b.name}
            </Link>
            <span className="text-muted">
              {" "}
              · {displayName(m.match.tournament.name)}
              {m.match.round ? `, ${m.match.round}` : ""}
            </span>
          </p>
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
            {path.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span>
                  <span className="text-xs text-muted">{i === 0 ? "Start " : `Set ${i} (${sets[i - 1].p1}–${sets[i - 1].p2}) `}</span>
                  {pct(p)}
                </span>
                {i < path.length - 1 && <span aria-hidden className="text-muted">→</span>}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">
            {m.a.name.split(" ").at(-1)}’s chance before the match and after each set, from the real set scores. In a live party the
            chance updates point by point from the real live score.
          </p>
        </section>
      )}

      <p className="text-sm">
        <Link href="/pickem" className="font-medium text-accent hover:underline">
          Find a match to watch →
        </Link>
      </p>
    </div>
  );
}
