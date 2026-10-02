import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Flag } from "@/components/flag";
import { PlayerAvatar } from "@/components/player-avatar";
import { getCountry } from "@/lib/data/countries";
import { displayName } from "@/lib/data/tournaments";
import { TOUR_LABEL } from "@/lib/format";
import { TOURS } from "@/lib/provider/types";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

const valid = (code: string) => /^[A-Z]{3}$/.test(code);

export async function generateMetadata({ params }: PageProps<"/countries/[code]">): Promise<Metadata> {
  const { code } = await params;
  return valid(code) ? { title: `${code} tennis` } : {};
}

export default async function CountryPage({ params }: PageProps<"/countries/[code]">) {
  const { code } = await params;
  if (!valid(code)) notFound();
  const year = new Date().getUTCFullYear();
  const c = await getCountry(code, year);
  const total = c.ranked.atp.length + c.ranked.wta.length + c.season.atp.w + c.season.wta.w + c.season.atp.l + c.season.wta.l;
  if (total === 0) notFound();

  return (
    <div className="space-y-6">
      <Link href="/countries" className="text-sm text-muted hover:text-foreground">
        ← Countries
      </Link>
      <header className="flex items-center gap-3">
        <Flag code={code} className="text-4xl" />
        <h1 className="text-3xl font-semibold tracking-tight">{code}</h1>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TOURS.map((t) => (
          <div key={t} className="col-span-1 rounded-xl border border-border bg-surface p-3 sm:col-span-2">
            <dt className="text-xs text-muted">
              {TOUR_LABEL[t]} {year}
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {c.season[t].w}–{c.season[t].l}
            </dd>
            <dd className="text-xs text-muted">
              {c.season[t].titles} titles · {c.ranked[t].length} in the top 100
            </dd>
          </div>
        ))}
      </dl>

      {TOURS.map((t) =>
        c.ranked[t].length ? (
          <section key={t} aria-labelledby={`c-${t}`} className="space-y-2">
            <h2 id={`c-${t}`} className="text-sm font-semibold uppercase tracking-wide text-muted">
              {TOUR_LABEL[t]} top 100
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {c.ranked[t].map((r) => (
                <li key={r.player.id}>
                  <Link href={`/players/${r.player.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-muted">
                    <span className="w-8 text-right font-semibold tabular-nums">{r.rank}</span>
                    <PlayerAvatar name={r.player.fullName} image={r.player.image} />
                    <span className="min-w-0 flex-1 truncate font-medium">{r.player.fullName}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}

      {c.recent.length > 0 && (
        <section aria-labelledby="c-recent" className="space-y-2">
          <h2 id="c-recent" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Recent results
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
            {c.recent.map((m) => (
              <li key={`${m.id}-${m.won}`} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded text-xs font-semibold ${m.won ? "bg-accent-soft text-accent" : "bg-surface-muted text-muted"}`}
                >
                  {m.won ? "W" : "L"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {m.winner} <span className="text-muted">beat</span> {m.loser}
                  </span>
                  <Link href={`/tournaments/${m.tournamentId}`} className="text-xs text-muted hover:underline">
                    {displayName(m.tournament)}
                    {m.round ? ` · ${m.round}` : ""}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
