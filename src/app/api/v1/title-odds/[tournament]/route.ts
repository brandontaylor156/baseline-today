import { apiError, apiJson } from "@/lib/api";
import { getTitleOdds } from "@/lib/data/title-odds";
import { getTournament } from "@/lib/data/tournaments";

// GET /api/v1/title-odds/<tournament id> → each remaining player's chance to reach every round.
export async function GET(_request: Request, { params }: RouteContext<"/api/v1/title-odds/[tournament]">) {
  const { tournament } = await params;
  if (!/^\d{1,9}$/.test(tournament)) return apiError("Pass a tournament id.");
  const [t, odds] = await Promise.all([getTournament(Number(tournament)), getTitleOdds(Number(tournament))]);
  if (!t) return apiError("Unknown tournament id.", 404);
  if (!odds) return apiError("No readable draw for this tournament, or it has finished.", 404);
  return apiJson(
    {
      tournament: { id: t.id, name: t.name, tour: t.tour, category: t.category, start: t.startDate, end: t.endDate },
      rounds: odds.rounds,
      players: odds.players.map((p) => ({
        id: p.id,
        name: p.name,
        seed: p.seed,
        title: Math.round(p.title * 10000) / 10000,
        // reach[r]: chance of winning at least r more matches from now.
        reach: p.reach.map((x) => Math.round(x * 10000) / 10000),
      })),
    },
    { maxAge: 600 },
  );
}
