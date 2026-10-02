// Does a Wikipedia draw page belong to a given tournament? Pure and unit tested.
//
// Identity comes from the page title: its event name ("2026 China Open – Women's singles" →
// "China Open") must share a distinctive word with the tournament's name, city or a known alias.
// Player overlap only confirms the right tour; it never picks the page.

import { normalizeName } from "./names";

/**
 * Wikipedia event names for tournaments whose provider name or city shares no distinctive word
 * with them. Keys: normalized provider name without "125"/numbering.
 */
export const ALIASES: Record<string, string[]> = {
  beijing: ["China Open"],
  rome: ["Italian Open"],
  "roland garros": ["French Open"],
  "internazionali bnl ditalia": ["Italian Open"],
  "indian wells": ["Indian Wells Open", "BNP Paribas Open"],
  doha: ["Qatar Open", "Qatar TotalEnergies Open"],
  "qatar exxonmobil open": ["Qatar Open", "Qatar ExxonMobil Open"],
  auckland: ["ASB Classic"],
  stuttgart: ["Porsche Tennis Grand Prix"],
  "s-hertogenbosch": ["Libéma Open", "Rosmalen Grass Court Championships"],
  "libema open": ["Libéma Open"],
  queens: ["Queen's Club Championships"],
  "hsbc championships": ["Queen's Club Championships"],
  "terra wortmann open": ["Halle Open"],
  montreal: ["Canadian Open", "National Bank Open"],
  "omnium banque nationale presente par rogers": ["Canadian Open", "National Bank Open"],
  "washington dc": ["Washington Open", "DC Open", "Mubadala DC Open", "Mubadala Citi DC Open"],
  "mubadala dc open": ["Washington Open", "DC Open"],
  cleveland: ["Tennis in the Land", "Cleveland Open"],
  seoul: ["Korea Open"],
  tokyo: ["Pan Pacific Open"],
  osaka: ["Japan Women's Open", "Japan Open"],
  austin: ["ATX Open"],
  bogota: ["Copa Colsanitas"],
  "cluj-napoca": ["Transylvania Open"],
  rabat: ["Morocco Open", "Grand Prix SAR La Princesse Lalla Meryem"],
  "grand prix hassan ii": ["Grand Prix Hassan II"],
  "mifel tennis open by telcel oppo": ["Los Cabos Open"],
  "plava laguna croatia open umag": ["Croatia Open"],
  "fayez sarofim co us mens clay court championship": ["U.S. Men's Clay Court Championships"],
  "abierto mexicano telcel presentado por hsbc": ["Mexican Open", "Abierto Mexicano Telcel"],
  "us open": ["US Open"],
  "nordea open": ["Swedish Open", "Nordea Open"],
  // WTA 125s whose English pages carry sponsor/event names (found via Italian Wikipedia).
  manila: ["Philippine Women's Open"],
  midland: ["Dow Tennis Classic"],
  "saint malo": ["L'Open 35 de Saint-Malo", "Open 35 de Saint-Malo"],
  jiujiang: ["Jiangxi Open"],
  paris: ["Trophée Clarins"],
  bari: ["Levante Open", "Open delle Puglie"],
  contrexeville: ["Grand Est Open 88"],
  newport: ["Hall of Fame Open"],
  bastad: ["Swedish Open"],
  warsaw: ["Polish Open"],
  philadelphia: ["Philly Open"],
  "sao paulo": ["SP Open", "São Paulo Open"],
  // Full names win over the shared city key (ROME 125 is not the WTA 1000 in Rome).
  "rome 125": ["Roma Open"],
  vic: ["Catalonia Open"],
  "united cup": [],
  "laver cup": [],
};

/** Words too generic to identify a tournament. */
const STOP = new Set(
  "open tennis international internationals championship championships cup ladies women womens men mens classic grand prix trophy challenger tournament presented presentado presente par por by the of de di la le el du des and tour atp wta masters series indoor outdoor court courts".split(
    " ",
  ),
);

export function tokens(text: string): string[] {
  return normalizeName(text.replace(/[’']/g, ""))
    .split(/[\s-]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
}

/**
 * "2026 China Open – Women's singles" → "China Open";
 * Italian "Parma Ladies Open 2026 - Singolare" → "Parma Ladies Open".
 */
export function eventName(title: string): string {
  if (/^\d{4}\s/.test(title)) return title.replace(/^\d{4}\s+/, "").split(/\s+[–-]\s+/)[0].trim();
  return title.split(/\s+\d{4}\s+[–-]\s+/)[0].trim();
}

/**
 * Italian pages carry no level categories, so their text must name the event's level
 * ("…un torneo … WTA 125 …"). English pages are checked by categories instead.
 */
export function levelInText(content: string, eventCategory: string | null): boolean {
  const level = eventCategory?.match(/(WTA|ATP)\s*\d+/i)?.[0];
  if (!level) return true;
  return new RegExp(level.replace(/\s+/, "\\s*"), "i").test(content);
}

/** Provider name without level/numbering noise: "ANTALYA 125 #2" → "antalya". */
export function baseName(name: string): string {
  return normalizeName(name.replace(/\b(125|250|500|1000)\b|#\s*\d+|\(.*?\)/g, " "));
}

export function edition(name: string): number | null {
  const m = name.match(/#\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

const ROMAN: Record<number, string> = { 1: "i", 2: "ii", 3: "iii", 4: "iv" };

/** Aliases for a provider name: its full name ("rome 125") first, then the shared base ("rome"). */
export function aliasesFor(name: string): string[] | undefined {
  const full = normalizeName(name.replace(/#\s*\d+|\(.*?\)/g, " "));
  return ALIASES[full] ?? ALIASES[baseName(name)];
}

/**
 * Numbered editions ("#2") must match "2"/"II" in the title; unnumbered ones must not carry 2+.
 * `hasNumberedSiblings`: the city also hosts numbered editions (ANTALYA 125 #1–#3), so an
 * unnumbered event there (ANTALYA 125 (ATIK)) must not take a numbered page at all.
 * Indoor/outdoor in the name must not contradict the title (OUTDOOR #2 ≠ "Oeiras Indoor 2").
 */
export function editionMatches(name: string, title: string, hasNumberedSiblings = false): boolean {
  const n = edition(name);
  const nameText = normalizeName(name);
  const titleText = normalizeName(eventName(title));
  if ((/\boutdoor\b/.test(nameText) && /\bindoors?\b/.test(titleText)) || (/\bindoor\b/.test(nameText) && /\boutdoors?\b/.test(titleText))) {
    return false;
  }
  // Numerals that are part of the tournament's own name ("Grand Prix Hassan II") aren't editions.
  const own = new Set(normalizeName(name.replace(/#\s*\d+/g, " ")).split(/\s+/));
  const words = normalizeName(eventName(title))
    .split(/\s+/)
    .filter((w) => !own.has(w));
  // Editions are small numbers (#1–#4); "Open 35 de Saint-Malo" or "Grand Est Open 88" are names.
  const titleNumber = words.map((w) => (/^[1-4]$/.test(w) ? Number(w) : Object.entries(ROMAN).find(([, r]) => r === w)?.[0])).find(Boolean);
  const titleN = titleNumber ? Number(titleNumber) : null;
  if (n === null) return titleN === null || (titleN === 1 && !hasNumberedSiblings);
  return titleN === n || (n === 1 && titleN === null);
}

/** Search phrases: aliases first, then the provider name and the city. */
export function searchPhrases(name: string, location: string | null): string[] {
  const aliases = aliasesFor(name) ?? [];
  const city = location?.split(",")[0]?.trim() ?? "";
  const cleaned = name.replace(/\b(125|250|500|1000)\b|#\s*\d+|\(.*?\)|\b(presented|presentado|présenté)\b.*$/gi, " ").replace(/\s+/g, " ").trim();
  const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return [...new Set([...aliases, titleCase(cleaned), titleCase(city)].filter((q) => q.length >= 3))];
}

/**
 * How well a page title identifies the tournament: the number of distinctive words its event
 * name shares with the provider name, city or aliases. 0 = not this tournament.
 */
export function titleScore(title: string, name: string, location: string | null, tour?: "atp" | "wta"): number {
  // ATP tour events are never Challengers (WTA 125 pages, though, are often named "… Challenger").
  if (tour === "atp" && /challenger/i.test(eventName(title))) return 0;
  const aliasList = aliasesFor(name);
  if (aliasList && aliasList.length === 0) return 0; // team events without a bracket draw
  // An alias that matches the whole event name is decisive (also covers short names like "US Open").
  const exact = (aliasList ?? []).some((a) => normalizeName(a) === normalizeName(eventName(title)));
  const event = new Set(tokens(eventName(title)));
  if (event.size === 0) return exact ? 10 : 0;
  const fromAliases = (aliasList ?? []).flatMap(tokens);
  const fromName = tokens(name);
  const fromCity = tokens(location?.split(",")[0] ?? "");
  const wanted = new Set([...fromAliases, ...fromName, ...fromCity]);
  let score = 0;
  for (const t of event) if (wanted.has(t)) score++;
  if (exact) score += 10;
  return score;
}

/** Draw pages mention their own tour ("WTA 1000", "ATP Tour") far more than the other one. */
export function tourMentioned(wikitext: string, tour: "atp" | "wta"): boolean {
  const wta = wikitext.match(/\bWTA\b/g)?.length ?? 0;
  const atp = wikitext.match(/\bATP\b/g)?.length ?? 0;
  return tour === "wta" ? wta > atp : atp > wta;
}

/**
 * The page's Wikipedia categories must match the event's level: ATP tour events never take an
 * "ATP Challenger Tour" page (even when its title lacks the word), WTA 125 events never take a
 * tour-level "WTA Tour" page and vice versa. Pages without level categories pass.
 */
export function levelFits(categories: string[], tour: "atp" | "wta", eventCategory: string | null): boolean {
  if (tour === "atp") return !categories.some((c) => /ATP Challenger Tour/i.test(c));
  const is125 = /125/.test(eventCategory ?? "");
  const page125 = categories.some((c) => /WTA 125/i.test(c));
  const pageTour = categories.some((c) => /^\d{4} WTA Tour$/i.test(c));
  return is125 ? !pageTour : !page125;
}

/**
 * The page's number of players must fit the tournament's draw (a 96-player Masters page is not a
 * 32-player WTA 125). Pages without a draw yet can't be verified.
 */
export function drawSizeFits(pagePlayers: number, drawSize: number | null): boolean {
  if (pagePlayers < 8) return false;
  if (!drawSize) return true;
  return pagePlayers <= drawSize * 1.25 + 4 && pagePlayers >= drawSize * 0.6;
}
