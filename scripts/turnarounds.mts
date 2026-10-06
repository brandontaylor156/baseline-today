// Win chances after each set, checked, and the greatest turnarounds (weekly):  npm run turnarounds
import { createAdminClient } from "@/lib/supabase/admin";
import { computeTurnarounds } from "@/lib/sync/turnarounds";

const started = Date.now();
console.log(JSON.stringify(await computeTurnarounds(createAdminClient())), `${((Date.now() - started) / 1000).toFixed(1)}s`);
