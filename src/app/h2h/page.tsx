import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";

import { H2HPickers } from "@/components/h2h-pickers";
import { getPlayer } from "@/lib/data/tennis";
import { TOUR_LABEL } from "@/lib/format";
import { h2hPath } from "@/lib/slug";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata: Metadata = {
  title: "Head-to-head",
  description: "Compare any two ATP or WTA players: head-to-head record by surface, every meeting since 2015 and win chances.",
};

const id = (v: string | string[] | undefined) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

// Picker page. A complete pair moves to its canonical address, /h2h/<a>-vs-<b>-<id>-<id>.
export default async function H2HPage({ searchParams }: PageProps<"/h2h">) {
  const q = await searchParams;
  const aId = id(q.a);
  const bId = id(q.b);
  const [a, b] = await Promise.all([aId ? getPlayer(aId) : null, bId ? getPlayer(bId) : null]);
  const sameTour = a && b && a.tour === b.tour;
  if (a && b && sameTour && a.id !== b.id) permanentRedirect(h2hPath({ id: a.id, name: a.fullName }, { id: b.id, name: b.fullName }));
  const { data: rivalries } = a ? { data: null } : await createPublicClient().rpc("top_rivalries", { p_min: 5, p_limit: 24 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Head-to-head</h1>
        <p className="text-sm text-muted">Every meeting in the tracked draws since 2015.</p>
      </div>
      {(!a || !b) && <H2HPickers a={a?.id ?? null} tour={a?.tour ?? null} />}
      {a && !b && <p className="text-sm text-muted">Pick a second {TOUR_LABEL[a.tour]} player to compare with {a.fullName}.</p>}
      {a && b && !sameTour && <p className="text-sm text-muted">ATP and WTA players don’t meet in singles. Pick two players from the same tour.</p>}
      {rivalries && rivalries.length > 0 && (
        <section aria-labelledby="rivalries-heading" className="space-y-2">
          <h2 id="rivalries-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Biggest rivalries
          </h2>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {rivalries.map((r) => (
              <li key={`${r.player_a}-${r.player_b}`}>
                <Link
                  href={h2hPath({ id: r.player_a, name: r.name_a }, { id: r.player_b, name: r.name_b })}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 hover:bg-surface-muted"
                >
                  <span className="min-w-0 truncate">
                    {r.name_a} vs {r.name_b}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{r.meetings} meetings</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Players in the current top 100, by meetings since 2015.</p>
        </section>
      )}
    </div>
  );
}
