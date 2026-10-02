import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/** Cache tag on every public tennis read; the daily job revalidates it after a successful sync. */
export const TENNIS_TAG = "tennis";
const REVALIDATE_SECONDS = 3600;

/**
 * Anonymous, cookie-free client for public tennis data. By default its fetches go through the
 * Next.js data cache, so rankings and player pages are served from cache instead of querying on
 * every visit. Live scores pass `{ cached: false }` to always read the latest rows.
 */
export function createPublicClient({ cached = true }: { cached?: boolean } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set");

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        cached
          ? fetch(input, { ...init, next: { revalidate: REVALIDATE_SECONDS, tags: [TENNIS_TAG] } })
          : fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
