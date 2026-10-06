import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ExplorerPicker } from "@/components/explorer-picker";
import { Flag } from "@/components/flag";
import { getPlayer } from "@/lib/data/tennis";
import { isTour, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Who stood in whose way",
  description:
    "How many titles each tennis player cost their rivals since 2015: every draw replayed with each contender replaced by a typical player. Alcaraz vs Sinner, Djokovic vs Medvedev, Swiatek vs Sabalenka.",
};

const fmt = (n: number) => n.toFixed(2);

function Person({ id, name, country }: { id: number | null; name: string; country: string | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Flag code={country} reserve />
      {id !== null ? (
        <Link href={`/lab/in-the-way?p=${id}`} className="truncate hover:underline">
          {name}
        </Link>
      ) : (
        <span className="truncate">{name}</span>
      )}
    </span>
  );
}

export default async function InTheWayPage({ searchParams }: PageProps<"/lab/in-the-way">) {
  const q = await searchParams;
  const pid = typeof q.p === "string" && /^\d{1,9}$/.test(q.p) ? Number(q.p) : null;
  const player = pid ? await getPlayer(pid) : null;
  const tour: Tour = player?.tour ?? (typeof q.tour === "string" && isTour(q.tour) ? q.tour : "atp");
  const db = createPublicClient();
  const [{ data: pairs }, { data: totals }] = await Promise.all([db.rpc("lab_denied_pairs", { p_tour: tour, p_limit: 20 }), db.rpc("lab_denied_totals", { p_tour: tour })]);
  const byId = new Map((totals ?? []).map((t) => [t.player_id, t]));

  // One player's view: who cost them titles, and whom they cost.
  let costMe: { id: number; gain: number }[] = [];
  let costThem: { id: number; gain: number }[] = [];
  if (player) {
    const [{ data: a }, { data: b }] = await Promise.all([
      db.from("lab_denied").select("player_id, gain").eq("other_id", player.id).not("player_id", "is", null).order("gain", { ascending: false }).limit(10),
      db.from("lab_denied").select("other_id, gain").eq("player_id", player.id).not("other_id", "is", null).order("gain", { ascending: false }).limit(10),
    ]);
    costMe = (a ?? []).map((r) => ({ id: r.player_id!, gain: r.gain }));
    costThem = (b ?? []).map((r) => ({ id: r.other_id!, gain: r.gain }));
  }
  const nameOf = (id: number) => byId.get(id) ?? { player_id: id, name: "?", country: null, cost_others: 0, cost_by_others: 0 };
  const top = [...(totals ?? [])].sort((a, b) => b.cost_others - a.cost_others).slice(0, 12);
  const blocked = [...(totals ?? [])].sort((a, b) => b.cost_by_others - a.cost_by_others).slice(0, 12);
  const me = player ? byId.get(player.id) : undefined;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <Link href="/lab" className="text-sm text-muted hover:text-foreground">
            ← Research lab
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{player ? `${player.fullName}: who stood in the way` : "Who stood in whose way"}</h1>
          <p className="text-sm text-muted">
            We replayed every rebuilt draw since 2015 with each contender (5%+ title chance) replaced by a typical player from that draw,
            and measured how much everyone else’s title chances rose. Summed over the years, that’s how many titles one player cost
            another.
          </p>
        </div>
        {!player && (
          <nav aria-label="Tour" className="flex overflow-hidden rounded-lg border border-border text-sm">
            {(["atp", "wta"] as const).map((t) => (
              <Link key={t} href={`/lab/in-the-way?tour=${t}`} aria-current={t === tour ? "page" : undefined} className={`px-3 py-1.5 ${t === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
                {TOUR_LABEL[t]}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <div className="max-w-md">
        <Suspense>
          <ExplorerPicker param="p" label={player ? "Another player" : "Look up a player"} target="/lab/in-the-way" />
        </Suspense>
      </div>

      {player && me && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-sm text-muted">Titles they cost others</dt>
              <dd className="text-2xl font-semibold tabular-nums">{me.cost_others.toFixed(1)}</dd>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-sm text-muted">Titles others cost them</dt>
              <dd className="text-2xl font-semibold tabular-nums">{me.cost_by_others.toFixed(1)}</dd>
            </div>
          </dl>
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ["Cost them the most", costMe],
                ["They cost the most", costThem],
              ] as const
            ).map(([title, rows]) => (
              <section key={title} aria-label={title} className="rounded-xl border border-border bg-surface p-4">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
                <ol className="space-y-2.5 text-sm">
                  {rows.map((r) => {
                    const o = nameOf(r.id);
                    return (
                      <li key={r.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <Person id={r.id} name={o.name} country={o.country} />
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">{fmt(r.gain)}</span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        </div>
      )}
      {player && !me && <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">No measurable effect either way for {player.fullName} yet.</p>}

      {!player && (
        <>
          <section aria-labelledby="pairs-heading" className="space-y-2">
            <h2 id="pairs-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              The biggest obstacles
            </h2>
            <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
              {(pairs ?? []).map((r) => (
                <li key={`${r.player_id}-${r.other_id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5">
                  <Person id={r.player_id} name={r.player} country={r.player_country} />
                  <span className="text-muted">cost</span>
                  <Person id={r.other_id} name={r.other} country={r.other_country} />
                  <span className="ml-auto font-semibold tabular-nums">{fmt(r.gain)} titles</span>
                </li>
              ))}
            </ol>
          </section>
          <div className="grid gap-6 md:grid-cols-2">
            {(
              [
                ["Cost the field the most titles", top, "cost_others"],
                ["Lost the most titles to others", blocked, "cost_by_others"],
              ] as const
            ).map(([title, rows, field]) => (
              <section key={title} aria-label={title} className="rounded-xl border border-border bg-surface p-4">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
                <ol className="space-y-2.5 text-sm">
                  {rows.map((r, i) => (
                    <li key={r.player_id} className="flex items-center gap-2">
                      <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <Person id={r.player_id} name={r.name} country={r.country} />
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{r[field].toFixed(1)}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}

      <p className="text-xs text-muted">
        Expected titles, not real ones: “cost 1.4 titles” means the other player’s title chances, added up over every shared draw, would
        have been 1.4 higher without them. A typical player is the draw’s median rating. Draws rebuilt from Wikipedia results since 2015;
        recomputed weekly.
      </p>
    </div>
  );
}
