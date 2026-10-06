// What moves a match beyond the ratings (weekly with the lab):  npm run factors
import { createAdminClient } from "@/lib/supabase/admin";
import { computeFactors } from "@/lib/sync/factors";

const started = Date.now();
console.log(JSON.stringify(await computeFactors(createAdminClient())), `${((Date.now() - started) / 1000).toFixed(1)}s`);
