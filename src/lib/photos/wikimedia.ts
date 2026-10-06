import "server-only";

import type { Tour } from "@/lib/provider/types";
import { normalizeName } from "@/lib/wiki/names";

import {
  birthDate,
  imageFileName,
  isTourPlayer,
  parseImageInfo,
  pickPlayerEntity,
  titleItems,
  type TitleQuery,
  type CommonsImageInfo,
  type ParsedImage,
  type WikidataEntity,
} from "./wikimedia-parse";

// Wikimedia asks API clients to identify themselves.
const USER_AGENT = "BaselineToday/1.0 (https://github.com/brandontaylor156/baseline-today)";
const THUMB_WIDTH = 320;

const MAX_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
    if (res.ok) return (await res.json()) as T;

    // Back off when rate limited, honoring Retry-After (seconds) if given.
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    throw new Error(`Wikimedia ${new URL(url).hostname} HTTP ${res.status}`);
  }
}

async function searchIds(name: string): Promise<string[]> {
  const params = new URLSearchParams({ action: "wbsearchentities", search: name, language: "en", type: "item", limit: "7", format: "json" });
  const data = await getJson<{ search?: { id: string }[] }>(`https://www.wikidata.org/w/api.php?${params}`);
  return (data.search ?? []).map((s) => s.id);
}

async function getEntities(ids: string[]): Promise<WikidataEntity[]> {
  if (ids.length === 0) return [];
  const params = new URLSearchParams({ action: "wbgetentities", ids: ids.join("|"), props: "claims", format: "json" });
  const data = await getJson<{ entities?: Record<string, WikidataEntity> }>(`https://www.wikidata.org/w/api.php?${params}`);
  // Keep search (relevance) order.
  return ids.map((id) => data.entities?.[id]).filter((e): e is WikidataEntity => Boolean(e?.claims));
}

async function getImage(fileName: string): Promise<ParsedImage | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: `File:${fileName}`,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: String(THUMB_WIDTH),
    iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl",
    format: "json",
  });
  const data = await getJson<{ query?: { pages?: Record<string, { imageinfo?: CommonsImageInfo[] }> } }>(
    `https://commons.wikimedia.org/w/api.php?${params}`,
  );
  const page = Object.values(data.query?.pages ?? {})[0];
  return parseImageInfo(page?.imageinfo?.[0]);
}

export interface PlayerLookup {
  wikidataId: string | null;
  birthDate: string | null;
  image: ParsedImage | null;
}

/** Finds the player on Wikidata (by known id, else by name) and their freely licensed photo. */
export async function lookupPlayer(fullName: string, tour: Tour, knownWikidataId: string | null): Promise<PlayerLookup> {
  const name = fullName.replace(/\s+/g, " ").trim();
  let entity = pickPlayerEntity(await getEntities(knownWikidataId ? [knownWikidataId] : await searchIds(name)), tour);

  // Chinese, Japanese and Korean players are often listed family name first ("Zhang Shuai").
  const words = name.split(" ");
  if (!entity && !knownWikidataId && words.length === 2) {
    entity = pickPlayerEntity(await getEntities(await searchIds(`${words[1]} ${words[0]}`)), tour);
  }
  if (!entity) return { wikidataId: null, birthDate: null, image: null };

  const file = imageFileName(entity);
  return { wikidataId: entity.id, birthDate: birthDate(entity), image: file ? await getImage(file) : null };
}

/**
 * Birth dates for players known only by name: their Wikipedia article (the draws link it), then the
 * article's Wikidata item, kept only when it is a tennis player of the tour's sex. A name whose plain
 * article is someone else gets a second try as "Name (tennis)". Up to 50 names per request.
 */
export async function birthDatesByTitle(names: string[], tour: Tour): Promise<Map<string, { wikidataId: string; birthDate: string | null }>> {
  const out = new Map<string, { wikidataId: string; birthDate: string | null }>();
  const attempt = async (titles: Map<string, string>) => {
    for (let i = 0; i < titles.size; i += 50) {
      const chunk = [...titles.entries()].slice(i, i + 50);
      const params = new URLSearchParams({ action: "query", format: "json", redirects: "1", prop: "pageprops", ppprop: "wikibase_item", titles: chunk.map(([, t]) => t).join("|") });
      const items = titleItems(chunk.map(([, t]) => t), await getJson<TitleQuery>(`https://en.wikipedia.org/w/api.php?${params}`));
      const entities = new Map((await getEntities([...new Set(items.values())])).map((e) => [e.id, e]));
      for (const [name, title] of chunk) {
        const entity = entities.get(items.get(title) ?? "");
        if (entity && isTourPlayer(entity, tour)) out.set(name, { wikidataId: entity.id, birthDate: birthDate(entity) });
      }
    }
  };
  await attempt(new Map(names.map((n) => [n, n])));
  await attempt(new Map(names.filter((n) => !out.has(n)).map((n) => [n, `${n} (tennis)`])));

  // Other spellings ("Aslan Karacev"): a Wikidata label or alias that matches the name exactly.
  for (const name of names.filter((n) => !out.has(n))) {
    const params = new URLSearchParams({ action: "wbsearchentities", search: name, language: "en", type: "item", limit: "7", format: "json" });
    const data = await getJson<{ search?: { id: string; match?: { text?: string } }[] }>(`https://www.wikidata.org/w/api.php?${params}`);
    const exact = (data.search ?? []).filter((r) => normalizeName(r.match?.text ?? "") === normalizeName(name)).map((r) => r.id);
    const entity = pickPlayerEntity(await getEntities(exact), tour);
    if (entity) out.set(name, { wikidataId: entity.id, birthDate: birthDate(entity) });
  }
  return out;
}
