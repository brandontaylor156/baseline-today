import { displayName, getSeasonTournaments } from "@/lib/data/tournaments";
import { isTour, TOUR_LABEL } from "@/lib/format";
import { buildCalendar, type IcsEvent } from "@/lib/ics";
import { SITE_URL } from "@/lib/site";

const HOST = new URL(SITE_URL).host;

// Public subscription feed of a tour's season calendar: /calendar/atp.ics or /calendar/wta.ics.
export async function GET(_request: Request, { params }: RouteContext<"/calendar/[file]">) {
  const { file } = await params;
  const tour = /^(atp|wta)\.ics$/.exec(file)?.[1];
  if (!tour || !isTour(tour)) return new Response("Not found", { status: 404 });

  const season = new Date().getUTCFullYear();
  const tournaments = (await getSeasonTournaments(season)).filter((t) => t.tour === tour && t.startDate);
  const events: IcsEvent[] = tournaments.map((t) => ({
    uid: `tournament-${t.id}@${HOST}`,
    summary: `${displayName(t.name)}${t.category ? ` (${t.category})` : ""}`,
    start: t.startDate!,
    end: t.endDate ?? t.startDate!,
    allDay: true,
    location: t.location ? displayName(t.location) : undefined,
    description: [t.surface, t.champion ? `Champion: ${t.champion.name}` : null].filter(Boolean).join(" · ") || undefined,
    url: `${SITE_URL}/tournaments/${t.id}`,
  }));

  return new Response(buildCalendar(`${TOUR_LABEL[tour]} ${season} · Baseline Today`, events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
