import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { displayName } from "@/lib/data/tournaments";
import { isTour, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 3600;

type P = { id: number; name: string; country: string | null };
type Records = {
  titles: (P & { n: number; slams: number })[];
  titles_by_surface: Record<string, (P & { n: number })[]>;
  finals: (P & { n: number })[];
  streaks: (P & { wins: number; from_date: string; to_date: string; from_event: string; to_event: string })[];
  youngest: (P & { days: number; tournament: string; season: number; match_id: number })[];
  oldest: (P & { days: number; tournament: string; season: number; match_id: number })[];
  final_upsets: (P & { loser: string | null; tournament: string; season: number; match_id: number; chance: number })[];
  tiebreaks: (P & { n: number })[];
  bagels: (P & { n: number })[];
  comebacks: (P & { n: number })[];
  matches: number;
};

export async function generateMetadata({ searchParams }: PageProps<"/records">): Promise<Metadata> {
  const { tour } = await searchParams;
  const t: Tour = typeof tour === "string" && isTour(tour) ? tour : "atp";
  return {
    title: `${TOUR_LABEL[t]} records since 2015`,
    description: `${TOUR_LABEL[t]} tennis records since 2015: most titles overall and by surface, longest winning streaks, youngest and oldest champions, biggest upsets in finals, most tiebreaks won.`,
  };
}

const years = (days: number) => {
  const y = Math.floor(days / 365.25);
  return `${y} years, ${Math.floor(days - y * 365.25)} days`;
};

function Who({ p }: { p: P }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Flag code={p.country} reserve />
      <Link href={`/players/${p.id}`} className="truncate hover:underline">
        {p.name}
      </Link>
    </span>
  );
}

function List({ title, note, rows }: { title: string; note?: string; rows: { key: string | number; who: P; value: string; detail?: React.ReactNode }[] }) {
  if (rows.length === 0) return null;
  const id = `r-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-surface p-4">
      <h2 id={id} className="text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
      <ol className="mt-2 space-y-2.5 text-sm">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-baseline gap-2">
            <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <Who p={r.who} />
              {r.detail && <span className="mt-1.5 block truncate text-xs text-muted">{r.detail}</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{r.value}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function RecordsPage({ searchParams }: PageProps<"/records">) {
  const { tour: q } = await searchParams;
  const tour: Tour = typeof q === "string" && isTour(q) ? q : "atp";
  const { data } = await createPublicClient().from("stat_cache").select("data, updated_at").eq("key", `records:${tour}`).maybeSingle();
  const r = (data?.data ?? null) as Records | null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{TOUR_LABEL[tour]} records since 2015</h1>
          <p className="text-sm text-muted">
            From {r?.matches.toLocaleString("en-US") ?? "the"} singles matches in our tracked draws (Wikipedia, CC BY-SA 4.0). Counts cover
            only those draws, so they can be lower than official career totals. Updated daily.
          </p>
        </div>
        <nav aria-label="Tour" className="flex overflow-hidden rounded-lg border border-border text-sm">
          {(["atp", "wta"] as const).map((t) => (
            <Link key={t} href={`/records?tour=${t}`} aria-current={t === tour ? "page" : undefined} className={`px-3 py-1.5 ${t === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {TOUR_LABEL[t]}
            </Link>
          ))}
        </nav>
      </div>

      {!r ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">Records are being computed. Check back after the next daily update.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <List
            title="Most titles"
            rows={r.titles.map((x) => ({ key: x.id, who: x, value: String(x.n), detail: x.slams ? `${x.slams} Grand Slam${x.slams === 1 ? "" : "s"}` : undefined }))}
          />
          <List
            title="Longest winning streaks"
            rows={r.streaks.map((x, i) => ({
              key: `${x.id}-${i}`,
              who: x,
              value: String(x.wins),
              detail: `${displayName(x.from_event)} ${x.from_date.slice(0, 4)} → ${displayName(x.to_event)} ${x.to_date.slice(0, 4)}`,
            }))}
          />
          {Object.entries(r.titles_by_surface)
            .sort(([a], [b]) => ["Hard", "Clay", "Grass"].indexOf(a) - ["Hard", "Clay", "Grass"].indexOf(b))
            .map(([surface, rows]) => (
              <List key={surface} title={`Most titles on ${surface.toLowerCase()}`} rows={rows.map((x) => ({ key: x.id, who: x, value: String(x.n) }))} />
            ))}
          <List title="Most finals" rows={r.finals.map((x) => ({ key: x.id, who: x, value: String(x.n) }))} />
          <List
            title="Youngest champions"
            rows={r.youngest.map((x) => ({ key: x.match_id, who: x, value: years(x.days).split(",")[0], detail: <Link href={`/matches/${x.match_id}`} className="hover:underline">{`${displayName(x.tournament)} ${x.season} · ${years(x.days)}`}</Link> }))}
          />
          <List
            title="Oldest champions"
            rows={r.oldest.map((x) => ({ key: x.match_id, who: x, value: years(x.days).split(",")[0], detail: <Link href={`/matches/${x.match_id}`} className="hover:underline">{`${displayName(x.tournament)} ${x.season} · ${years(x.days)}`}</Link> }))}
          />
          <List
            title="Biggest upsets in a final"
            note="The champion's chance before the final, by our model."
            rows={r.final_upsets.map((x) => ({
              key: x.match_id,
              who: x,
              value: `${Math.round(x.chance * 100)}%`,
              detail: <Link href={`/matches/${x.match_id}`} className="hover:underline">{`beat ${x.loser ?? "?"} · ${displayName(x.tournament)} ${x.season}`}</Link>,
            }))}
          />
          <List title="Most tiebreaks won" rows={r.tiebreaks.map((x) => ({ key: x.id, who: x, value: String(x.n) }))} />
          <List title="Most comeback wins" note="Won after losing the first set." rows={r.comebacks.map((x) => ({ key: x.id, who: x, value: String(x.n) }))} />
          <List title="Most 6-0 sets won" rows={r.bagels.map((x) => ({ key: x.id, who: x, value: String(x.n) }))} />
        </div>
      )}
    </div>
  );
}
