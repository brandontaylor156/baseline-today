import { searchPlayers } from "@/lib/data/tennis";

// Reads our database only (search_players RPC), never the provider.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 80) ?? "";
  const results = await searchPlayers(q);
  return Response.json(results, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
