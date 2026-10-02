import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { Movement } from "@/components/movement";
import { PlayerAvatar } from "@/components/player-avatar";
import { PushToggle } from "@/components/push-toggle";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { WikiCredit } from "@/components/wiki-credit";
import { RESULT_SELECT, titleFromUrl, toResult, type Result, type ResultRow } from "@/lib/data/results";
import { formatPoints, TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";
import { pushConfig } from "@/lib/push/config";
import { createClient } from "@/lib/supabase/server";
import { roundRank } from "@/lib/wiki/rows";

export const metadata: Metadata = { title: "My players" };

// Per-user page: rendered on every request with the visitor's own session (RLS applies).
export default async function MyPlayersPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) return <SignInPrompt next="/my-players" />;

  const [{ data: favorites, error }, { data: latestAtp }, { data: latestWta }] = await Promise.all([
    supabase
      .from("favorites")
      .select(
        "created_at, players!inner(id, tour, full_name, country_code, player_images(image_url, source_url, author, license, license_url), rankings(ranking_date, rank, points, movement))",
      )
      .order("ranking_date", { referencedTable: "players.rankings", ascending: false })
      .limit(1, { referencedTable: "players.rankings" }),
    supabase.rpc("ranking_dates", { p_tour: "atp" }).limit(1),
    supabase.rpc("ranking_dates", { p_tour: "wta" }).limit(1),
  ]);
  if (error) throw new Error(`favorites: ${error.message}`);

  const latest: Record<Tour, string | undefined> = { atp: latestAtp?.[0], wta: latestWta?.[0] };
  const rows = (favorites ?? [])
    .map((f) => {
      const p = f.players;
      const r = p.rankings[0];
      const current = r && r.ranking_date === latest[p.tour as Tour] ? r : null;
      return { player: p, tour: p.tour as Tour, ranking: current };
    })
    .sort((a, b) => (a.ranking?.rank ?? 9999) - (b.ranking?.rank ?? 9999));

  // Each favorite's latest confirmed result.
  const ids = rows.map((r) => r.player.id);
  const last = new Map<number, Result>();
  const sources: { title: string; url: string }[] = [];
  if (ids.length) {
    const { data: results } = await supabase
      .from("matches")
      .select(RESULT_SELECT)
      .eq("status", "final")
      .eq("confirmed", true)
      .or(`player1_id.in.(${ids.join(",")}),player2_id.in.(${ids.join(",")})`)
      .order("score_changed_at", { ascending: false })
      .limit(200);
    const sorted = ((results ?? []) as unknown as ResultRow[])
      .map(toResult)
      .sort((a, b) => (b.tournamentStart ?? "").localeCompare(a.tournamentStart ?? "") || roundRank(b.round) - roundRank(a.round));
    for (const r of sorted) {
      for (const p of [r.player1, r.player2]) {
        if (p?.id != null && ids.includes(p.id) && !last.has(p.id)) last.set(p.id, r);
      }
    }
    for (const r of last.values()) {
      if (r.provider === "wikipedia" && r.sourceUrl && !sources.some((x) => x.url === r.sourceUrl)) {
        sources.push({ title: titleFromUrl(r.sourceUrl), url: r.sourceUrl });
      }
    }
  }

  const push = pushConfig();

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My players</h1>
        <p className="text-sm text-muted">Your favorites, where they stand this week, and how their last match went.</p>
      </div>

      {rows.length > 0 && push && <PushToggle publicKey={push.publicKey} />}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-muted">No favorites yet. Open any player and tap “Add to favorites”.</p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
            Browse the rankings →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {rows.map(({ player, tour, ranking }) => (
            <li key={player.id}>
              <Link href={`/players/${player.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted">
                <PlayerAvatar
                  name={player.full_name}
                  image={
                    player.player_images
                      ? {
                          imageUrl: player.player_images.image_url,
                          sourceUrl: player.player_images.source_url,
                          author: player.player_images.author,
                          license: player.player_images.license,
                          licenseUrl: player.player_images.license_url,
                        }
                      : null
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{player.full_name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <Flag code={player.country_code} />
                    {TOUR_LABEL[tour]}
                    {player.country_code ? ` · ${player.country_code}` : ""}
                  </span>
                  <LastResult playerId={player.id} result={last.get(player.id)} />
                </span>
                <span className="text-right">
                  <span className="block font-semibold tabular-nums">{ranking ? `#${ranking.rank}` : "Unranked"}</span>
                  {ranking && (
                    <span className="flex items-center justify-end gap-2 text-xs text-muted tabular-nums">
                      <Movement value={ranking.movement} />
                      {formatPoints(ranking.points)} pts
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <WikiCredit sources={sources} />
    </section>
  );
}

function LastResult({ playerId, result: r }: { playerId: number; result: Result | undefined }) {
  if (!r) return null;
  const side = r.player1?.id === playerId ? 1 : 2;
  const opponent = side === 1 ? r.player2 : r.player1;
  const won = r.winner === side;
  return (
    <span className="mt-0.5 block truncate text-xs text-muted">
      <span className={won ? "font-medium text-accent" : ""}>{won ? "Won" : "Lost"}</span> vs {opponent?.name ?? "?"} ·{" "}
      {r.tournament.name}
      {r.round ? ` ${r.round}` : ""}
    </span>
  );
}
