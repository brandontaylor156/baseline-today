import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { getEventHistory, getEvents, parseEventSlug } from "@/lib/data/history";
import { TOUR_LABEL } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

async function load(slug: string) {
  const ids = parseEventSlug(slug);
  if (!ids) return null;
  const event = (await getEvents()).find((e) => e.tour === ids.tour && e.providerId === ids.providerId);
  if (!event) return null;
  const history = await getEventHistory(ids.tour, ids.providerId);
  return history ? { event, history } : null;
}

export async function generateMetadata({ params }: PageProps<"/history/[event]">): Promise<Metadata> {
  const data = await load((await params).event);
  if (!data) return { title: "Tournament history" };
  const { event, history } = data;
  const recent = history.editions
    .filter((e) => e.winner)
    .slice(0, 3)
    .map((e) => `${e.winner!.name} (${e.season})`)
    .join(", ");
  return {
    title: `${event.name} past winners and finals since 2015`,
    description: `Every ${event.name} champion and final since 2015${recent ? `: ${recent}` : ""}. Most titles, scores and the biggest upsets at the event.`,
    alternates: { canonical: `/history/${event.slug}` },
  };
}

function Name({ p }: { p: { id: number | null; name: string } | null }) {
  if (!p) return <span className="text-muted">–</span>;
  return p.id !== null ? (
    <Link href={`/players/${p.id}`} className="hover:underline">
      {p.name}
    </Link>
  ) : (
    <span>{p.name}</span>
  );
}

export default async function EventHistoryPage({ params }: PageProps<"/history/[event]">) {
  const { event: slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { event, history } = data;
  if (slug !== event.slug) permanentRedirect(`/history/${event.slug}`);
  const multi = history.champions.filter((c) => c.titles >= 2);

  return (
    <article className="space-y-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${event.name} champions`,
          url: `${SITE_URL}/history/${event.slug}`,
          itemListElement: history.editions
            .filter((e) => e.winner)
            .map((e, i) => ({ "@type": "ListItem", position: i + 1, name: `${e.season}: ${e.winner!.name}` })),
        }}
      />
      <div>
        <Link href="/history" className="text-sm text-muted hover:text-foreground">
          ← Tournament history
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{event.name}: past winners</h1>
        <p className="text-sm text-muted">
          {TOUR_LABEL[event.tour]}
          {event.category ? ` · ${event.category}` : ""}
          {event.surface ? ` · ${event.surface}` : ""} · {history.editions.length} editions since 2015 ·{" "}
          <Link href={`/tournaments/${event.latestId}`} className="font-medium text-accent hover:underline">
            {event.latestSeason} edition →
          </Link>
        </p>
      </div>

      {multi.length > 0 && (
        <section aria-labelledby="multi-heading" className="space-y-2">
          <h2 id="multi-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Most titles here
          </h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {multi.map((c) => (
              <li key={`${c.id}-${c.name}`} className="rounded-lg border border-border bg-surface px-3 py-1.5">
                <Name p={c} /> <span className="font-semibold tabular-nums">×{c.titles}</span>{" "}
                <span className="text-xs text-muted">({[...c.seasons].sort().join(", ")})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="finals-heading" className="space-y-2">
        <h2 id="finals-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Every final
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">{event.name} finals by season</caption>
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Season</th>
                <th scope="col" className="px-2 py-2 font-medium">Champion</th>
                <th scope="col" className="px-2 py-2 font-medium">Runner-up</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Score</th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Champion’s chance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.editions.map((e) => (
                <tr key={e.tournamentId}>
                  <th scope="row" className="px-3 py-2 text-left font-normal tabular-nums">
                    <Link href={`/tournaments/${e.tournamentId}`} className="hover:underline">
                      {e.season}
                    </Link>
                  </th>
                  <td className="px-2 py-2 font-medium">{e.winner ? <Name p={e.winner} /> : <span className="font-normal text-muted">Not tracked</span>}</td>
                  <td className="px-2 py-2">
                    <Name p={e.loser} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-xs tabular-nums">
                    {e.matchId ? (
                      <Link href={`/matches/${e.matchId}`} className="hover:underline">
                        {e.score || "final"}
                      </Link>
                    ) : null}
                  </td>
                  <td className="hidden px-3 py-2 text-right tabular-nums text-muted sm:table-cell">
                    {e.winnerChance !== null ? `${Math.round(e.winnerChance * 100)}%` : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          “Champion’s chance” is our model’s estimate before the final. Results from Wikipedia draw pages (CC BY-SA 4.0); editions without a
          readable draw page show as not tracked.
        </p>
      </section>

      {history.upsets.length > 0 && (
        <section aria-labelledby="ups-heading" className="space-y-2">
          <h2 id="ups-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Biggest upsets at {event.name}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
            {history.upsets.map((u) => (
              <li key={u.matchId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="w-10 shrink-0 font-semibold tabular-nums text-accent">{Math.round(u.chance * 100)}%</span>
                <span className="min-w-0 flex-1">
                  <Name p={u.winner} /> <span className="text-muted">beat</span> <Name p={u.loser} />
                </span>
                <Link href={`/matches/${u.matchId}`} className="text-xs text-muted hover:underline">
                  {u.season}
                  {u.round ? ` · ${u.round}` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
