import "server-only";

// Wikipedia Action API client (English, plus Italian as a fallback for events English doesn't
// cover). Wikimedia etiquette: descriptive User-Agent, one request at a time, maxlag so we back
// off when their servers are busy.

const USER_AGENT = "BaselineToday/1.0 (https://github.com/brandontaylor156/baseline-today)";
const MAX_ATTEMPTS = 4;
const BATCH = 50; // titles per request (API limit)

export type WikiLang = "en" | "it";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function api<T>(params: Record<string, string>, lang: WikiLang = "en"): Promise<T> {
  const url = `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params })}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
    const retryAfter = Number(res.headers.get("retry-after"));
    if (res.ok) {
      const body = (await res.json()) as T & { error?: { code: string; info: string } };
      if (body.error?.code === "maxlag" && attempt < MAX_ATTEMPTS) {
        await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5) * 1000);
        continue;
      }
      if (body.error) throw new Error(`Wikipedia API: ${body.error.info}`);
      return body;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    throw new Error(`Wikipedia API HTTP ${res.status}`);
  }
}

export function pageUrl(title: string, lang: WikiLang = "en"): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/** Stored titles carry a language prefix for non-English pages: "it:Parma Ladies Open 2026 - Singolare". */
export function splitStoredTitle(stored: string): { lang: WikiLang; title: string } {
  return stored.startsWith("it:") ? { lang: "it", title: stored.slice(3) } : { lang: "en", title: stored };
}

export function storedTitle(title: string, lang: WikiLang): string {
  return lang === "en" ? title : `${lang}:${title}`;
}

/** Singles draw pages of a season whose title matches the query, best first. */
export async function searchDrawPages(season: number, query: string, lang: WikiLang = "en"): Promise<string[]> {
  const singlesWord = lang === "it" ? "Singolare" : "singles";
  const data = await api<{ query?: { search?: { title: string }[] } }>(
    { action: "query", list: "search", srsearch: `intitle:${season} intitle:${singlesWord} ${query} tennis`, srnamespace: "0", srlimit: "10" },
    lang,
  );
  const titles = (data.query?.search ?? []).map((s) => s.title);
  return lang === "it"
    ? // "Parma Ladies Open 2026 - Singolare [femminile|maschile]"
      titles.filter((t) => new RegExp(`\\s${season}\\s+[–-]\\s+Singolare`, "i").test(t) && !/(junior|carrozzina)/i.test(t))
    : titles.filter((t) => t.startsWith(String(season)) && /singles$/i.test(t) && !/(girls'|boys'|wheelchair|junior)/i.test(t));
}

export interface PageRevision {
  title: string;
  lang: WikiLang;
  revid: number;
  timestamp: string;
  content: string;
  /** Page categories without the namespace prefix, e.g. "2025 ATP Challenger Tour". */
  categories: string[];
}

/** Latest revision ids and timestamps (cheap; no content). Missing pages are omitted. */
export async function latestRevisionIds(titles: string[], lang: WikiLang = "en"): Promise<Map<string, { revid: number; timestamp: string }>> {
  const out = new Map<string, { revid: number; timestamp: string }>();
  for (let i = 0; i < titles.length; i += BATCH) {
    const data = await api<{ query?: { pages?: { title: string; missing?: boolean; revisions?: { revid: number; timestamp: string }[] }[] } }>(
      { action: "query", prop: "revisions", rvprop: "ids|timestamp", titles: titles.slice(i, i + BATCH).join("|") },
      lang,
    );
    for (const p of data.query?.pages ?? []) {
      const r = p.revisions?.[0];
      if (!p.missing && r) out.set(p.title, { revid: r.revid, timestamp: r.timestamp });
    }
  }
  return out;
}

/** Latest wikitext and categories of each page (follows redirects; keyed by the requested title). */
export async function latestRevisions(titles: string[], lang: WikiLang = "en"): Promise<Map<string, PageRevision>> {
  const out = new Map<string, PageRevision>();
  // One page per request: draw pages are large.
  for (const title of titles) {
    const data = await api<{
      query?: {
        pages?: {
          title: string;
          missing?: boolean;
          revisions?: { revid: number; timestamp: string; slots: { main: { content: string } } }[];
          categories?: { title: string }[];
        }[];
      };
    }>(
      { action: "query", prop: "revisions|categories", rvprop: "ids|timestamp|content", rvslots: "main", cllimit: "50", redirects: "1", titles: title },
      lang,
    );
    const p = data.query?.pages?.[0];
    const r = p?.revisions?.[0];
    if (p && !p.missing && r) {
      out.set(title, {
        title: p.title,
        lang,
        revid: r.revid,
        timestamp: r.timestamp,
        content: r.slots.main.content,
        categories: (p.categories ?? []).map((c) => c.title.replace(/^[^:]+:/, "")),
      });
    }
  }
  return out;
}
