import "server-only";

import { flagCode } from "@/lib/flags";
import type { AdminClient } from "@/lib/supabase/admin";
import { hostCountry } from "@/lib/venue";
import { normalizeName } from "@/lib/wiki/names";

const USER_AGENT = "BaselineToday/1.0 (https://github.com/brandontaylor156/baseline-today)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every row of a query, 1,000 at a time (PostgREST caps each response). */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(`conditions: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function json<T>(url: string): Promise<T | null> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * attempt);
      continue;
    }
    return null;
  }
  return null;
}

type GeoResult = { name: string; latitude: number; longitude: number; elevation?: number; timezone?: string; country_code?: string; admin1?: string; population?: number };

// Venues the geocoder can't resolve from the location string alone: the real place, and its region where the name is shared.
const ALIASES: Record<string, { name: string; admin1?: string; iso2?: string }> = {
  "LOS CABOS": { name: "Cabo San Lucas" },
  MIDLAND: { name: "Midland", admin1: "Michigan" },
  ANDORRA: { name: "Andorra la Vella" },
  MARRAKECH: { name: "Marrakesh" },
  "WASHINGTON DC": { name: "Washington", admin1: "District of Columbia" },
  WASHINGTON: { name: "Washington", admin1: "District of Columbia" },
  "HONG KONG": { name: "Hong Kong", iso2: "HK" },
  "SANTA CRUZ": { name: "Santa Cruz de la Sierra" },
  WIMBLEDON: { name: "Wimbledon", iso2: "GB" },
};

/** The best geocoding match: the most populous place with the same name in the right country (and region), else the first in the right country. Pure. */
export function pickPlace(results: GeoResult[], city: string, iso2: string | null, admin1?: string): GeoResult | null {
  const inCountry = results.filter((r) => (!iso2 || r.country_code?.toUpperCase() === iso2) && (!admin1 || r.admin1 === admin1));
  const exact = inCountry.filter((r) => normalizeName(r.name) === normalizeName(city)).sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
  return exact[0] ?? inCountry[0] ?? null;
}

/** Indoor or not, from a tournament article's infobox surface field ("Hard (indoor)", "Hard (i)"). Pure. */
export function indoorFrom(wikitext: string): boolean | null {
  const surface = wikitext.match(/\|\s*surface\s*=([^\n]*)/i)?.[1];
  if (!surface) return null;
  return /indoor|\(i\)|carpet/i.test(surface);
}

/** Geocodes new venues (Open-Meteo / GeoNames). */
async function syncVenues(db: AdminClient): Promise<number> {
  const ts = await all((f, t) => db.from("tournaments").select("location").eq("provider", "balldontlie").not("location", "is", null).order("id").range(f, t));
  const known = await all((f, t) => db.from("venues").select("location").order("location").range(f, t));
  const have = new Set(known.map((v) => v.location));
  const todo = [...new Set(ts.map((t) => t.location!))].filter((l) => !have.has(l) && !/multiple|-/i.test(l.split(",")[0].replace(/^'s-/, "")));
  let n = 0;
  for (const location of todo) {
    const raw = location.split(",")[0].trim();
    const alias = ALIASES[raw.toUpperCase()];
    const city = alias?.name ?? raw;
    const ioc = hostCountry(location);
    const iso2 = alias?.iso2 ?? (ioc ? (flagCode(ioc)?.toUpperCase() ?? null) : null);
    const q = new URLSearchParams({ name: city, count: "10", language: "en", format: "json" });
    const body = await json<{ results?: GeoResult[] }>(`https://geocoding-api.open-meteo.com/v1/search?${q}`);
    const place = pickPlace(body?.results ?? [], city, iso2, alias?.admin1);
    await db.from("venues").upsert({
      location,
      name: place?.name ?? null,
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
      elevation: place?.elevation ?? null,
      timezone: place?.timezone ?? null,
      country_code: place?.country_code ?? null,
      checked_at: new Date().toISOString(),
    });
    if (place) n++;
    await sleep(150);
  }
  return n;
}

/**
 * Venues, indoor flags and weather for every finished event: coordinates, elevation and time zone
 * from Open-Meteo's geocoder (GeoNames, CC BY 4.0); indoor from the event's Wikipedia infobox; daily
 * weather over the event days from Open-Meteo's historical archive (ERA5, CC BY 4.0).
 */
export async function syncConditions(db: AdminClient, now = new Date(), limit = 2000): Promise<string> {
  const venues = await syncVenues(db);
  const cutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const [ts, draws, done, places] = await Promise.all([
    all((f, t) => db.from("tournaments").select("id, location, start_date, end_date, season").eq("provider", "balldontlie").lte("end_date", cutoff).gte("start_date", "2015-01-01").order("id").range(f, t)),
    all((f, t) => db.from("wiki_draws").select("tournament_id, page_title").order("tournament_id").range(f, t)),
    all((f, t) => db.from("event_conditions").select("tournament_id").order("tournament_id").range(f, t)),
    all((f, t) => db.from("venues").select("location, latitude, longitude").order("location").range(f, t)),
  ]);
  const have = new Set(done.map((d) => d.tournament_id));
  const place = new Map(places.map((p) => [p.location, p]));
  const titleOf = new Map(draws.map((d) => [d.tournament_id, d.page_title]));
  const todo = ts.filter((t) => !have.has(t.id)).slice(0, limit);

  // Indoor flags from the event articles (the draw page's parent), 20 at a time.
  const article = (title: string | null | undefined) => (title ? title.replace(/^it:/, "").replace(/\s+[–-]\s+.*$/, "") : null);
  const indoor = new Map<number, boolean | null>();
  const titles = todo.map((t) => [t.id, article(titleOf.get(t.id))] as const).filter(([, a]) => a);
  for (let i = 0; i < titles.length; i += 20) {
    const chunk = titles.slice(i, i + 20);
    const q = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "revisions", rvprop: "content", rvslots: "main", rvsection: "0", redirects: "1", titles: chunk.map(([, a]) => a!).join("|") });
    const body = await json<{ query?: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[]; pages?: { title: string; revisions?: { slots: { main: { content: string } } }[] }[] } }>(`https://en.wikipedia.org/w/api.php?${q}`);
    const step = (list?: { from: string; to: string }[]) => new Map((list ?? []).map((x) => [x.from, x.to]));
    const norm = step(body?.query?.normalized);
    const redir = step(body?.query?.redirects);
    const content = new Map((body?.query?.pages ?? []).map((p) => [p.title, p.revisions?.[0]?.slots.main.content ?? ""]));
    for (const [id, a] of chunk) {
      const n = norm.get(a!) ?? a!;
      indoor.set(id, indoorFrom(content.get(redir.get(n) ?? n) ?? ""));
    }
  }

  let weathered = 0;
  for (const t of todo) {
    const p = t.location ? place.get(t.location) : undefined;
    const isIndoor = indoor.get(t.id) ?? null;
    let w: { temp_max: number | null; apparent_max: number | null; wind_max: number | null; precipitation: number | null } = { temp_max: null, apparent_max: null, wind_max: null, precipitation: null };
    if (p?.latitude != null && p.longitude != null && t.start_date && t.end_date && isIndoor !== true) {
      const q = new URLSearchParams({
        latitude: String(p.latitude),
        longitude: String(p.longitude),
        start_date: t.start_date,
        end_date: t.end_date,
        daily: "temperature_2m_max,apparent_temperature_max,wind_speed_10m_max,precipitation_sum",
        timezone: "auto",
      });
      const body = await json<{ daily?: Record<string, (number | null)[]> }>(`https://archive-api.open-meteo.com/v1/archive?${q}`);
      const mean = (k: string) => {
        const xs = (body?.daily?.[k] ?? []).filter((x): x is number => x !== null);
        return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
      };
      w = { temp_max: mean("temperature_2m_max"), apparent_max: mean("apparent_temperature_max"), wind_max: mean("wind_speed_10m_max"), precipitation: mean("precipitation_sum") };
      if (w.temp_max !== null) weathered++;
      await sleep(120);
    }
    const { error } = await db.from("event_conditions").upsert({ tournament_id: t.id, indoor: isIndoor, article: article(titleOf.get(t.id)), ...w, checked_at: new Date().toISOString() });
    if (error) throw new Error(`conditions: save: ${error.message}`);
  }
  return `${venues} venues geocoded, ${todo.length} events, ${weathered} with weather`;
}
