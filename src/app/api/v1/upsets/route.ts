import { apiJson } from "@/lib/api";
import { getSeasonMatches } from "@/lib/data/season";
import { upsets } from "@/lib/leaders";
import { TOURS } from "@/lib/provider/types";

// GET /api/v1/upsets?days=7&max=0.35 → wins where the model gave the winner the smallest chance.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const days = Math.min(60, Math.max(1, Number(params.get("days")) || 7));
  const max = Math.min(0.5, Math.max(0.01, Number(params.get("max")) || 0.35));
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const matches = (await Promise.all(TOURS.map((t) => getSeasonMatches(t, now.getUTCFullYear())))).flat().filter((m) => m.date >= since);
  return apiJson(
    upsets(matches, max, 50).map(({ match: m, winnerChance }) => ({
      matchId: m.id,
      tour: m.tour,
      tournament: m.tournamentName,
      round: m.round,
      winner: m.winner === 1 ? { id: m.p1.id, name: m.p1.name } : { id: m.p2.id, name: m.p2.name },
      loser: m.winner === 1 ? { id: m.p2.id, name: m.p2.name } : { id: m.p1.id, name: m.p1.name },
      winnerChance: Math.round(winnerChance * 1000) / 1000,
    })),
    { maxAge: 900 },
  );
}
