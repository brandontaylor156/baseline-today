import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ExplorerPicker } from "@/components/explorer-picker";
import { Flag } from "@/components/flag";
import { getPlayer } from "@/lib/data/tennis";
import { mostSimilar, standouts, type Profile } from "@/lib/lab/similar";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Players with similar results",
  description: "Find the players whose results look most alike: surface strengths, tiebreaks, deciding sets, comebacks and how they do as favourite or underdog.",
};

export default async function SimilarPage({ searchParams }: PageProps<"/lab/similar">) {
  const { p } = await searchParams;
  const pid = typeof p === "string" && /^\d{1,9}$/.test(p) ? Number(p) : null;
  const player = pid ? await getPlayer(pid) : null;
  const { data } = player ? await createPublicClient().from("stat_cache").select("data").eq("key", `profiles:${player.tour}`).maybeSingle() : { data: null };
  const profiles = (data?.data ?? []) as unknown as Profile[];
  const mine = player ? profiles.find((x) => x.player_id === player.id) : undefined;
  const matches = mine ? mostSimilar(mine.player_id, profiles) : [];
  const traits = mine ? standouts(mine.player_id, profiles) : [];

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <Link href="/lab" className="text-sm text-muted hover:text-foreground">
          ← Research lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{player ? `Players like ${player.fullName}` : "Players with similar results"}</h1>
        <p className="text-sm text-muted">
          Compares what results since 2023 say about how a player wins: share of games won, straight-set wins, tiebreaks, deciding sets,
          comebacks, results as favourite and as underdog, and their edge on each surface. Players with 40+ matches.
        </p>
      </div>
      <div className="max-w-md">
        <Suspense>
          <ExplorerPicker param="p" label={player ? "Another player" : "Player"} target="/lab/similar" />
        </Suspense>
      </div>

      {player && !mine && <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">Not enough tracked matches since 2023 to build a profile.</p>}

      {mine && traits.length > 0 && (
        <section aria-labelledby="traits-heading" className="space-y-2">
          <h2 id="traits-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            What stands out
          </h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {traits.map((t) => (
              <li key={t.label} className={`rounded-full border px-3 py-1 ${t.high ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}>
                {t.high ? "More" : "Fewer"} {t.label}
                {t.label.endsWith("edge") ? (t.high ? " (stronger)" : " (weaker)") : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {matches.length > 0 && (
        <section aria-labelledby="sim-heading" className="space-y-2">
          <h2 id="sim-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Most similar
          </h2>
          <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
            {matches.map((m) => (
              <li key={m.profile.player_id} className="flex items-start gap-3 px-4 py-3">
                <span className="w-12 shrink-0 font-semibold tabular-nums text-accent">{m.similarity}%</span>
                <span className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-1.5">
                    <Flag code={m.profile.country} reserve />
                    <Link href={`/lab/similar?p=${m.profile.player_id}`} className="font-medium hover:underline">
                      {m.profile.name}
                    </Link>
                  </span>
                  <span className="mt-1.5 block text-xs text-muted">
                    {m.shared.length ? `Both: ${m.shared.join(", ")}.` : ""} {m.differs ? `Biggest difference: ${m.differs.more ? "more" : "fewer"} ${m.differs.label}.` : ""}
                  </span>
                </span>
                <Link href={`/h2h?a=${player!.id}&b=${m.profile.player_id}`} className="shrink-0 py-1 text-xs text-muted hover:text-foreground hover:underline">
                  Head-to-head
                </Link>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">
            Similarity compares standardized traits (100% = identical results profile). It describes results, not technique: two players
            can get there very differently.
          </p>
        </section>
      )}
    </div>
  );
}
