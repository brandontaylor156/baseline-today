// Venues, indoor flags and weather for finished events (weekly):  npm run sync:conditions
import { createAdminClient } from "@/lib/supabase/admin";
import { syncConditions } from "@/lib/sync/conditions";

const started = Date.now();
console.log(await syncConditions(createAdminClient()), `${((Date.now() - started) / 1000).toFixed(1)}s`);
