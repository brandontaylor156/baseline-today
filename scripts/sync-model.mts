// Recompute Elo ratings and pre-match probabilities:  npm run sync:model
import { createAdminClient } from "@/lib/supabase/admin";
import { computeModel } from "@/lib/sync/model";

const started = Date.now();
console.log(JSON.stringify({ ...(await computeModel(createAdminClient())), seconds: Math.round((Date.now() - started) / 1000) }));
