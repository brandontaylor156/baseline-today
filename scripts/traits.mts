// What hand, backhand and height are worth on top of the ratings (weekly):  npm run traits
import { createAdminClient } from "@/lib/supabase/admin";
import { computeTraits } from "@/lib/sync/traits-analysis";

const started = Date.now();
console.log(JSON.stringify(await computeTraits(createAdminClient()), null, 1), `${((Date.now() - started) / 1000).toFixed(1)}s`);
