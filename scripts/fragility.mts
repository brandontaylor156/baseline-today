// Fragile and ruthless favourites (weekly with the factors):  npm run fragility
import { createAdminClient } from "@/lib/supabase/admin";
import { computeFragility } from "@/lib/sync/fragility";

const started = Date.now();
console.log(JSON.stringify(await computeFragility(createAdminClient())), `${((Date.now() - started) / 1000).toFixed(1)}s`);
