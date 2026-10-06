import { getRatingWeeks } from "@/lib/data/lab";
import { getPlayer } from "@/lib/data/tennis";

// A player's rating after each week they played (for the time machine).
export async function GET(_request: Request, { params }: RouteContext<"/api/lab/ratings/[id]">) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [player, weeks] = await Promise.all([getPlayer(Number(id)), getRatingWeeks(Number(id))]);
  if (!player || weeks.length === 0) return Response.json({ error: "No rating history" }, { status: 404 });
  return Response.json(
    { id: player.id, name: player.fullName, tour: player.tour, weeks },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400" } },
  );
}
