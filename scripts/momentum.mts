// Tiebreak momentum, checked against the in-match model (weekly):  npm run momentum
import { createAdminClient } from "@/lib/supabase/admin";
import { computeMomentum } from "@/lib/sync/momentum";

const started = Date.now();
console.log(JSON.stringify(await computeMomentum(createAdminClient()), null, 1), `${((Date.now() - started) / 1000).toFixed(1)}s`);
