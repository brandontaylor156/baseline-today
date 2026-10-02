import { displayName } from "@/lib/data/tournaments";
import { getPlayer } from "@/lib/data/tennis";
import { buildCalendar, type IcsEvent } from "@/lib/ics";
import { SITE_URL } from "@/lib/site";
import { createPublicClient } from "@/lib/supabase/public";

const HOST = new URL(SITE_URL).host;

// Public subscription feed for one player: this season's tournaments they're in (from results and
// published draws) and their scheduled matches that have a start time. No personal data.
export async function GET(_request: Request, { params }: RouteContext<"/calendar/players/[file]">) {
  const { file } = await params;
  const match = /^(\d+)\.ics$/.exec(file);
  const player = match ? await getPlayer(Number(match[1])) : null;
  if (!player) return new Response("Not found", { status: 404 });

  const season = new Date().getUTCFullYear();
  const db = createPublicClient();
  const [{ data: played }, { data: drawn }, { data: scheduled }] = await Promise.all([
    db
      .from("matches")
      .select("tournament_id")
      .eq("season", season)
      .eq("confirmed", true)
      .or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`)
      .limit(500),
    db.from("wiki_draws").select("tournament_id").filter("bracket->lines", "cs", JSON.stringify([{ id: player.id }])),
    db
      .from("matches")
      .select("id, round, scheduled_at, player1_id, player1_name, player2_name, tournaments!inner(name, location), p1:players!matches_player1_id_fkey(full_name), p2:players!matches_player2_id_fkey(full_name)")
      .eq("status", "scheduled")
      .eq("confirmed", true)
      .not("scheduled_at", "is", null)
      .or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`)
      .limit(50),
  ]);
  const ids = [...new Set([...(played ?? []), ...(drawn ?? [])].map((r) => r.tournament_id))];
  const { data: tournaments } = ids.length
    ? await db.from("tournaments").select("id, name, location, category, start_date, end_date").in("id", ids).eq("season", season)
    : { data: [] };

  const events: IcsEvent[] = [];
  for (const t of tournaments ?? []) {
    if (!t.start_date) continue;
    events.push({
      uid: `tournament-${t.id}-player-${player.id}@${HOST}`,
      summary: `${player.fullName} at ${displayName(t.name)}`,
      start: t.start_date,
      end: t.end_date ?? t.start_date,
      allDay: true,
      location: t.location ? displayName(t.location) : undefined,
      description: t.category ?? undefined,
      url: `${SITE_URL}/tournaments/${t.id}`,
    });
  }
  for (const m of scheduled ?? []) {
    const name1 = m.p1?.full_name ?? m.player1_name ?? "TBD";
    const name2 = m.p2?.full_name ?? m.player2_name ?? "TBD";
    events.push({
      uid: `match-${m.id}@${HOST}`,
      summary: `${name1} vs ${name2}`,
      start: m.scheduled_at!,
      allDay: false,
      location: m.tournaments.location ? displayName(m.tournaments.location) : undefined,
      description: [displayName(m.tournaments.name), m.round].filter(Boolean).join(", "),
      url: `${SITE_URL}/players/${player.id}`,
    });
  }

  return new Response(buildCalendar(`${player.fullName} · Baseline Today`, events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
