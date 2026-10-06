import "server-only";

import { SITE_URL } from "@/lib/site";

// IndexNow tells Bing, Yandex, Seznam and others about new or changed pages right away (Google
// doesn't use it; it reads the sitemap). The key is public by design: it's served from
// /public/<key>.txt to prove the pings come from the site's owner.
export const INDEXNOW_KEY = "447a8b74f419cf147fea548adc78a6cb";

/** Submits up to 10,000 site URLs; production only, never throws. */
export async function submitIndexNow(paths: string[]): Promise<number | string> {
  if (process.env.VERCEL_ENV !== "production") return "skipped (not production)";
  const urlList = [...new Set(paths)].slice(0, 10_000).map((p) => `${SITE_URL}${p}`);
  if (urlList.length === 0) return 0;
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(SITE_URL).host, key: INDEXNOW_KEY, keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`, urlList }),
  }).catch((err: Error) => err);
  return res instanceof Error ? `error: ${res.message}` : res.ok ? urlList.length : `error: HTTP ${res.status}`;
}
