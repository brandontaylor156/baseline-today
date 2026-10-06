// schema.org JSON-LD for search engines (pure, unit tested). Only facts the page itself shows.
import { SITE_NAME, SITE_URL } from "@/lib/site";

type Json = Record<string, unknown>;
const url = (path: string) => `${SITE_URL}${path}`;
const TOUR_ORG: Record<string, string> = { atp: "ATP Tour", wta: "WTA Tour" };

export function websiteLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function playerLd(p: {
  id: number;
  tour: string;
  fullName: string;
  countryName: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  heightCm: number | null;
  imageUrl: string | null;
}): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: p.fullName,
    url: url(`/players/${p.id}`),
    jobTitle: "Professional tennis player",
    ...(p.countryName ? { nationality: { "@type": "Country", name: p.countryName } } : {}),
    ...(p.birthDate ? { birthDate: p.birthDate } : {}),
    ...(p.birthPlace ? { birthPlace: { "@type": "Place", name: p.birthPlace } } : {}),
    ...(p.heightCm ? { height: { "@type": "QuantitativeValue", value: p.heightCm, unitCode: "CMT" } } : {}),
    ...(p.imageUrl ? { image: p.imageUrl } : {}),
    memberOf: { "@type": "SportsOrganization", name: TOUR_ORG[p.tour] ?? p.tour.toUpperCase() },
  };
}

export function tournamentLd(t: {
  id: number;
  name: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  champion: string | null;
}): Json {
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: t.name,
    sport: "Tennis",
    url: url(`/tournaments/${t.id}`),
    ...(t.startDate ? { startDate: t.startDate } : {}),
    ...(t.endDate ? { endDate: t.endDate } : {}),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    ...(t.location ? { location: { "@type": "Place", name: t.location, address: t.location } } : {}),
    ...(t.champion ? { winner: { "@type": "Person", name: t.champion } } : {}),
  };
}

export function matchLd(m: {
  id: number;
  name: string;
  tournament: string;
  location: string | null;
  startDate: string | null;
  a: { id: number | null; name: string };
  b: { id: number | null; name: string };
  winner: 1 | 2 | null;
}): Json {
  const person = (s: { id: number | null; name: string }) => ({ "@type": "Person", name: s.name, ...(s.id !== null ? { url: url(`/players/${s.id}`) } : {}) });
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: m.name,
    sport: "Tennis",
    url: url(`/matches/${m.id}`),
    ...(m.startDate ? { startDate: m.startDate } : {}),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    superEvent: { "@type": "SportsEvent", name: m.tournament },
    ...(m.location ? { location: { "@type": "Place", name: m.location, address: m.location } } : {}),
    competitor: [person(m.a), person(m.b)],
    ...(m.winner ? { winner: person(m.winner === 1 ? m.a : m.b) } : {}),
  };
}

/** Safe to embed in a <script>: no "</script>" can close the tag early. */
export function ldScript(data: Json): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
