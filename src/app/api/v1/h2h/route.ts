import { apiError, apiJson, idParam } from "@/lib/api";
import { getHeadToHead } from "@/lib/data/h2h";
import { predictPair } from "@/lib/data/predictions";
import { getPlayer } from "@/lib/data/tennis";
import { SITE_URL } from "@/lib/site";
import { h2hPath } from "@/lib/slug";

// GET /api/v1/h2h?a=<id>&b=<id> → record, by surface, every meeting and the model's chances.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const aId = idParam(params.get("a"));
  const bId = idParam(params.get("b"));
  if (aId === null || bId === null || aId === bId) return apiError("Pass two different player ids as a and b (find ids with /api/v1/players?q=).");
  const [a, b] = await Promise.all([getPlayer(aId), getPlayer(bId)]);
  if (!a || !b) return apiError("Unknown player id.", 404);
  if (a.tour !== b.tour) return apiError("The players are on different tours.");
  const [h2h, ...model] = await Promise.all([
    getHeadToHead(a.id, b.id),
    ...([null, "Hard", "Clay", "Grass"] as const).map((s) => predictPair(a.tour, a.id, b.id, s)),
  ]);
  const chance = (i: number) => (model[i] ? Math.round(model[i]!.p * 1000) / 1000 : null);
  return apiJson(
    {
      a: { id: a.id, name: a.fullName },
      b: { id: b.id, name: b.fullName },
      wins: { a: h2h.winsA, b: h2h.winsB },
      bySurface: h2h.bySurface,
      modelChanceA: { all: chance(0), hard: chance(1), clay: chance(2), grass: chance(3) },
      meetings: h2h.meetings.map((m) => ({
        matchId: m.id,
        tournament: m.tournament.name,
        season: m.tournamentStart?.slice(0, 4) ?? null,
        round: m.round,
        surface: m.surface,
        winner: m.winner === null ? null : (m.winner === 1 ? m.player1 : m.player2)?.id === a.id ? "a" : "b",
        sets: m.sets.filter((s) => s.p1 !== null && s.p2 !== null).map((s) => ((m.player1?.id === a.id ? [s.p1, s.p2] : [s.p2, s.p1]) as [number, number])),
        detail: m.resultDetail,
      })),
      page: `${SITE_URL}${h2hPath({ id: a.id, name: a.fullName }, { id: b.id, name: b.fullName })}`,
    },
    { maxAge: 3600 },
  );
}
