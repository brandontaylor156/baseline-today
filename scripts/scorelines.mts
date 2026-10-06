// How well scoreline probabilities match real results (weekly with the lab):  npm run scorelines -- [--tune]
import { createAdminClient } from "@/lib/supabase/admin";
import { computeScorelines } from "@/lib/sync/scorelines";

const started = Date.now();
console.log(JSON.stringify(await computeScorelines(createAdminClient(), new Date(), process.argv.includes("--tune"))), `${((Date.now() - started) / 1000).toFixed(1)}s`);
