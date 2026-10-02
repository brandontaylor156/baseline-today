import { getMatchPreview } from "@/lib/data/match-preview";
import { displayName } from "@/lib/data/tournaments";
import type { SetScore } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";

// Public facts about one match for watch-party rooms: players, pre-match chance and, when the
// provider has it, the live score. Short cache so rooms stay current.
export async function GET(_request: Request, { params }: RouteContext<"/api/matches/[id]">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [m, { data: live }] = await Promise.all([
    getMatchPreview(Number(id)),
    createPublicClient({ cached: false })
      .from("matches")
      .select("status, is_live, set_scores, player1_game_score, player2_game_score, server, winner_side")
      .eq("id", Number(id))
      .maybeSingle(),
  ]);
  if (!m || !live) return Response.json({ error: "Not found" }, { status: 404 });

  const fiveSets = m.tour === "atp" && /grand slam/i.test(m.category ?? "");
  const server = (live.server ?? "").toLowerCase();
  const serverA = !server ? null : server === "1" || server === "player1" || server === String(m.a.id) ? true : server === "2" || server === "player2" || server === String(m.b.id) ? false : null;
  return Response.json(
    {
      id: Number(id),
      tour: m.tour,
      tournament: displayName(m.match.tournament.name),
      tournamentId: m.match.tournament.id,
      round: m.match.round,
      surface: m.surface,
      bestOf: fiveSets ? 5 : 3,
      a: { id: m.a.id, name: m.a.name, countryCode: m.a.countryCode, rank: m.a.rank },
      b: { id: m.b.id, name: m.b.name, countryCode: m.b.countryCode, rank: m.b.rank },
      chanceA: m.chanceA,
      status: live.status,
      winner: live.winner_side,
      live: live.is_live
        ? { sets: (Array.isArray(live.set_scores) ? live.set_scores : []) as unknown as SetScore[], gameA: live.player1_game_score, gameB: live.player2_game_score, serverA }
        : null,
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30" } },
  );
}
