import { apiError, apiJson } from "@/lib/api";
import { searchPlayers } from "@/lib/data/tennis";

// GET /api/v1/players?q=sinner → matching players (id, tour, name, country). Accent-insensitive.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 60) return apiError("Pass q with 2–60 characters.");
  const players = await searchPlayers(q, 10);
  return apiJson(
    players.map((p) => ({ id: p.id, tour: p.tour, name: p.fullName, country: p.countryCode })),
    { maxAge: 3600 },
  );
}
