import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { SeasonLines } from "@/components/season-lines";
import { getAging } from "@/lib/data/lab";
import { getRatedPlayers } from "@/lib/data/ratings";
import { isTour, TOUR_LABEL } from "@/lib/format";
import { ageOn } from "@/lib/puzzle";
import { rankAmong } from "@/lib/lab/aging";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Aging curves and projections",
  description: "How tennis players improve and decline with age (ATP and WTA, measured on the same players year to year), and where today's young players are projected to be.",
};


export default async function AgingPage({ searchParams }: PageProps<"/lab/aging">) {
  const { tour: q } = await searchParams;
  const tour: Tour = typeof q === "string" && isTour(q) ? q : "atp";
  const [atp, wta, rated] = await Promise.all([getAging("atp"), getAging("wta"), getRatedPlayers(tour)]);

  // Cumulative curve: rating relative to the field, starting at 0 at the youngest age.
  const cumulative = (rows: typeof atp) => {
    let total = 0;
    return [{ season: rows[0]?.age ?? 18, value: 0, n: 0 }, ...rows.map((r) => ({ season: r.age + 1, value: (total += r.delta), n: r.players }))];
  };
  const deltas = new Map((tour === "atp" ? atp : wta).map((r) => [r.age, r]));
  const change = (age: number, years: number) => {
    let sum = 0;
    for (let a = age; a < age + years; a++) {
      const d = deltas.get(a);
      if (!d || d.players < 15) return null; // too few players to project from
      sum += d.delta;
    }
    return sum;
  };

  // Young players in this week's top 100, with birth dates.
  const top = rated.filter((r) => r.rank !== null && r.id !== null);
  const { data: born } = await createPublicClient().from("players").select("id, birth_date").in("id", top.map((r) => r.id!));
  const birth = new Map((born ?? []).map((b) => [b.id, b.birth_date]));
  const today = new Date().toISOString().slice(0, 10);
  const field = rated.map((r) => r.elo);
  const young = top
    .map((r) => ({ r, age: ageOn(birth.get(r.id!) ?? null, today) }))
    .filter((x): x is { r: (typeof top)[number]; age: number } => x.age !== null && x.age <= 23)
    .sort((a, b) => b.r.elo - a.r.elo)
    .slice(0, 20);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <Link href="/lab" className="text-sm text-muted hover:text-foreground">
            ← Research lab
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Aging curves</h1>
          <p className="text-sm text-muted">
            How much players improve from one age to the next, measured on the same players year to year and against that year’s field,
            from every result since 2017.
          </p>
        </div>
        <nav aria-label="Tour" className="flex overflow-hidden rounded-lg border border-border text-sm">
          {(["atp", "wta"] as const).map((t) => (
            <Link key={t} href={`/lab/aging?tour=${t}`} aria-current={t === tour ? "page" : undefined} className={`px-3 py-1.5 ${t === tour ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}>
              {TOUR_LABEL[t]}
            </Link>
          ))}
        </nav>
      </div>

      <section aria-labelledby="curve-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 id="curve-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Rating gained since the youngest age, against the field
        </h2>
        <SeasonLines
          series={[
            { name: "ATP", points: cumulative(atp) },
            { name: "WTA", points: cumulative(wta) },
          ]}
          label="Average cumulative rating change by age, relative to the field, ATP and WTA"
          scale="points"
          axis="age"
        />
      </section>

      {young.length > 0 && (
        <section aria-labelledby="proj-heading" className="space-y-2">
          <h2 id="proj-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Where today’s young {TOUR_LABEL[tour]} players are headed
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">Projected ratings for players aged 23 or under in the top 100</caption>
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Player</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Age</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Rating now</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">In 1 year</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">In 3 years</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {young.map(({ r, age }) => {
                  const one = change(age, 1);
                  const three = change(age, 3);
                  const cell = (c: number | null) =>
                    c === null ? "–" : `${Math.round(r.elo + c)} (#${rankAmong(r.elo + c, field)} by rating)`;
                  return (
                    <tr key={r.key}>
                      <th scope="row" className="max-w-0 px-3 py-2 text-left font-normal sm:max-w-none">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <Flag code={r.countryCode} reserve />
                          <Link href={`/players/${r.id}`} className="truncate hover:underline">
                            {r.name}
                          </Link>
                          <span className="shrink-0 text-xs text-muted">#{r.rank}</span>
                        </span>
                      </th>
                      <td className="px-2 py-2 text-right">{age}</td>
                      <td className="px-2 py-2 text-right font-semibold">{Math.round(r.elo)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">{cell(one)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{cell(three)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            The average path, not a prediction for any one player: careers vary hugely. “By rating” is where that rating would sit among
            today’s active players.
          </p>
        </section>
      )}

      <p className="text-xs text-muted">
        Method: each player’s average rating over each year of age, minus that calendar year’s field average; then the change from one
        age to the next for the same player, averaged over all players with 20+ tracked matches in both years. Players who fade often
        stop playing enough to count, which flattens the late-career decline. Small samples at the youngest and oldest ages; no
        projection is shown where fewer than 15 players back an age.
      </p>
    </div>
  );
}
