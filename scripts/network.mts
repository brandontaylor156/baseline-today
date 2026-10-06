// Prestige from the win network, its test, and the chain-finder edges (weekly):  npm run network
import { createAdminClient } from "@/lib/supabase/admin";
import { computeNetwork } from "@/lib/sync/network";

const started = Date.now();
console.log(JSON.stringify(await computeNetwork(createAdminClient()), null, 1), `${((Date.now() - started) / 1000).toFixed(1)}s`);
