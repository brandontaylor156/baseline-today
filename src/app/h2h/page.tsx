import type { Metadata } from "next";
import Link from "next/link";

import { H2HPickers } from "@/components/h2h-pickers";
import { PlayerAvatar } from "@/components/player-avatar";
import { PlayerResults } from "@/components/player-results";
import { WikiCredit } from "@/components/wiki-credit";
import { getHeadToHead } from "@/lib/data/h2h";
import { getPlayer, type PlayerDetail } from "@/lib/data/tennis";
import { TOUR_LABEL } from "@/lib/format";

const id = (v: string | string[] | undefined) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

export async function generateMetadata({ searchParams }: PageProps<"/h2h">): Promise<Metadata> {
  const q = await searchParams;
  const [a, b] = await Promise.all([id(q.a), id(q.b)].map((x) => (x ? getPlayer(x) : null)));
  return { title: a && b ? `${a.fullName} vs ${b.fullName}` : "Head-to-head" };
}

function Side({ player, wins, align }: { player: PlayerDetail; wins: number; align: "left" | "right" }) {
  const rank = player.history.at(-1)?.rank;
  return (
    <div className={`flex flex-1 flex-col items-center gap-2 text-center ${align === "right" ? "sm:items-end sm:text-right" : "sm:items-start sm:text-left"}`}>
      <PlayerAvatar name={player.fullName} image={player.image} countryCode={player.countryCode} size="lg" />
      <Link href={`/players/${player.id}`} className="text-lg font-semibold hover:underline sm:text-xl">
        {player.fullName}
      </Link>
      <span className="text-xs text-muted">{rank ? `#${rank} ${TOUR_LABEL[player.tour]}` : TOUR_LABEL[player.tour]}</span>
      <span className="text-5xl font-semibold tabular-nums">{wins}</span>
    </div>
  );
}

export default async function H2HPage({ searchParams }: PageProps<"/h2h">) {
  const q = await searchParams;
  const aId = id(q.a);
  const bId = id(q.b);
  const [a, b] = await Promise.all([aId ? getPlayer(aId) : null, bId ? getPlayer(bId) : null]);
  const sameTour = a && b && a.tour === b.tour;
  const h2h = a && b && sameTour && a.id !== b.id ? await getHeadToHead(a.id, b.id) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Head-to-head</h1>
        <p className="text-sm text-muted">Every meeting in the tracked draws since 2024.</p>
      </div>

      {(!a || !b) && <H2HPickers a={a?.id ?? null} tour={a?.tour ?? null} />}
      {a && !b && <p className="text-sm text-muted">Pick a second {TOUR_LABEL[a.tour]} player to compare with {a.fullName}.</p>}
      {a && b && !sameTour && <p className="text-sm text-muted">ATP and WTA players don’t meet in singles. Pick two players from the same tour.</p>}

      {a && b && h2h && (
        <>
          <section aria-label="Record" className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              <Side player={a} wins={h2h.winsA} align="left" />
              <span className="self-center text-sm font-medium text-muted">vs</span>
              <Side player={b} wins={h2h.winsB} align="right" />
            </div>
            {h2h.bySurface.length > 0 && (
              <dl className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-1 border-t border-border pt-4 text-sm">
                {h2h.bySurface.map((s) => (
                  <div key={s.surface} className="flex gap-2">
                    <dt className="text-muted">{s.surface}</dt>
                    <dd className="font-medium tabular-nums">
                      {s.a}–{s.b}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section aria-labelledby="meetings-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
            <h2 id="meetings-heading" className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
              Meetings{h2h.meetings.length ? ` · ${h2h.meetings.length}` : ""}
            </h2>
            {h2h.meetings.length === 0 ? (
              <p className="py-3 text-sm text-muted">No meetings in the tracked draws.</p>
            ) : (
              <>
                <p className="mb-1 text-xs text-muted">From {a.fullName}’s side.</p>
                <PlayerResults playerId={a.id} results={h2h.meetings} />
              </>
            )}
            <WikiCredit sources={h2h.sources} className="mt-3" />
          </section>

          <Link href={`/h2h?a=${a.id}`} className="inline-block text-sm text-accent hover:underline">
            Compare {a.fullName} with someone else →
          </Link>
        </>
      )}
    </div>
  );
}
