import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Flag } from "@/components/flag";
import { getRivals } from "@/lib/data/rivals";
import { getPlayer } from "@/lib/data/tennis";
import { displayName } from "@/lib/data/tournaments";
import { TOUR_LABEL } from "@/lib/format";
import { h2hPath } from "@/lib/slug";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

async function load(params: PageProps<"/players/[id]/rivals">["params"]) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return null;
  const player = await getPlayer(Number(id));
  if (!player) return null;
  const rivals = await getRivals(player.id);
  return rivals ? { player, rivals } : null;
}

export async function generateMetadata({ params }: PageProps<"/players/[id]/rivals">): Promise<Metadata> {
  const data = await load(params);
  if (!data) return { title: "Rivals" };
  const { player, rivals } = data;
  const top = rivals.rivals.slice(0, 3).map((r) => r.name).join(", ");
  return {
    title: `${player.fullName}'s record against every opponent`,
    description: `${player.fullName}'s head-to-head records since 2015 against ${rivals.rivals.length} opponents${top ? `, including ${top}` : ""}, by surface, with records against the top 10 and top 100.`,
  };
}

const wl = ([w, l]: [number, number]) => `${w}–${l}`;
const SURF = [
  ["hard", "Hard"],
  ["clay", "Clay"],
  ["grass", "Grass"],
] as const;

export default async function RivalsPage({ params }: PageProps<"/players/[id]/rivals">) {
  const data = await load(params);
  if (!data) notFound();
  const { player, rivals } = data;
  const total = rivals.rivals.reduce<[number, number]>((t, r) => [t[0] + r.wins, t[1] + r.losses], [0, 0]);

  return (
    <article className="space-y-6">
      <div>
        <Link href={`/players/${player.id}`} className="text-sm text-muted hover:text-foreground">
          ← {player.fullName}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{player.fullName} against every opponent</h1>
        <p className="text-sm text-muted">
          {TOUR_LABEL[player.tour]} singles in the tracked draws since 2015, walkovers excluded. {rivals.rivals.length} opponents,{" "}
          {rivals.matches} matches.
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: "Overall", v: total },
          { label: "vs today’s top 10", v: rivals.vsTop10 },
          { label: "vs today’s top 100", v: rivals.vsTop100 },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border border-border bg-surface p-3 sm:p-4">
            <dt className="text-xs text-muted">{x.label}</dt>
            <dd className="text-xl font-semibold tabular-nums sm:text-2xl">{wl(x.v)}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Record against each opponent</caption>
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Opponent</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Record</th>
              {SURF.map(([, label]) => (
                <th key={label} scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">
                  {label}
                </th>
              ))}
              <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Last meeting</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rivals.rivals.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="max-w-0 px-3 py-2 text-left font-normal sm:max-w-none">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Flag code={r.country} reserve />
                    {r.id !== null ? (
                      <Link href={h2hPath({ id: player.id, name: player.fullName }, { id: r.id, name: r.name })} className="truncate hover:underline">
                        {r.name}
                      </Link>
                    ) : (
                      <span className="truncate">{r.name}</span>
                    )}
                    {r.rank !== null && <span className="shrink-0 text-xs text-muted">#{r.rank}</span>}
                  </span>
                </th>
                <td className={`px-2 py-2 text-right font-semibold ${r.wins > r.losses ? "text-up" : r.wins < r.losses ? "text-down" : ""}`}>
                  {r.wins}–{r.losses}
                </td>
                {SURF.map(([key]) => (
                  <td key={key} className="hidden px-2 py-2 text-right text-muted sm:table-cell">
                    {r.surfaces[key][0] + r.surfaces[key][1] ? wl(r.surfaces[key]) : "–"}
                  </td>
                ))}
                <td className="hidden px-3 py-2 text-xs text-muted md:table-cell">
                  <Link href={`/matches/${r.last.matchId}`} className="hover:underline">
                    {r.last.won ? "Won" : "Lost"} · {displayName(r.last.tournament)} {r.last.season}
                    {r.last.round ? ` · ${r.last.round}` : ""}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Records count wins and losses from {player.fullName}’s side; green when ahead. Opponent ranks are this week’s top 100. Tap a name for the
        full head-to-head. Results from Wikipedia draw pages (CC BY-SA 4.0).
      </p>
    </article>
  );
}
