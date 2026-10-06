import { apiError, apiJson, idParam } from "@/lib/api";
import { getRatingWeeks } from "@/lib/data/lab";
import { createPublicClient } from "@/lib/supabase/public";

// Research lab data:
//   /api/v1/lab/title-chances?tournament=<id>   every entrant's pre-tournament title chance
//   /api/v1/lab/ratings?player=<id>             weekly ratings (overall and per surface) since 2015
//   /api/v1/lab/in-the-way?player=<id>          expected titles they cost others, and others cost them
//   /api/v1/lab/forecast?tour=atp|wta           "if a major started today", per surface
export async function GET(request: Request, { params }: RouteContext<"/api/v1/lab/[dataset]">) {
  const { dataset } = await params;
  const q = new URL(request.url).searchParams;
  const db = createPublicClient();

  if (dataset === "title-chances") {
    const id = idParam(q.get("tournament"));
    if (id === null) return apiError("Pass tournament=<id>.");
    const { data } = await db.from("lab_title_chances").select("player_id, player_key, chance, champion, rating, path_chance").eq("tournament_id", id).order("chance", { ascending: false });
    if (!data?.length) return apiError("No rebuilt draw for that tournament.", 404);
    return apiJson({ tournament: id, entrants: data }, { maxAge: 86400 });
  }
  if (dataset === "ratings") {
    const id = idParam(q.get("player"));
    if (id === null) return apiError("Pass player=<id>.");
    const weeks = await getRatingWeeks(id);
    if (!weeks.length) return apiError("No rating history for that player.", 404);
    return apiJson({ player: id, weeks }, { maxAge: 86400 });
  }
  if (dataset === "in-the-way") {
    const id = idParam(q.get("player"));
    if (id === null) return apiError("Pass player=<id>.");
    const [{ data: cost }, { data: costBy }] = await Promise.all([
      db.from("lab_denied").select("other_id, gain").eq("player_id", id).order("gain", { ascending: false }).limit(50),
      db.from("lab_denied").select("player_id, gain").eq("other_id", id).order("gain", { ascending: false }).limit(50),
    ]);
    return apiJson({ player: id, costOthers: cost ?? [], costByOthers: costBy ?? [] }, { maxAge: 86400 });
  }
  if (dataset === "forecast") {
    const tour = q.get("tour") === "wta" ? "wta" : "atp";
    const { data } = await db.from("stat_cache").select("data, updated_at").eq("key", `forecast:${tour}`).maybeSingle();
    if (!data) return apiError("No forecast yet.", 404);
    return apiJson({ tour, updated: data.updated_at, ...(data.data as object) }, { maxAge: 3600 });
  }
  return apiError("Unknown dataset. Use title-chances, ratings, in-the-way or forecast.", 404);
}
