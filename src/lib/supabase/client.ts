import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import { publicSupabaseEnv } from "./env";

/** Browser client acting as the signed-in user (cookie session); RLS limits it to their own rows. */
export function createClient() {
  const { url, key } = publicSupabaseEnv();
  return createBrowserClient<Database>(url, key);
}
