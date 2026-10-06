// ATP Challenger results from Wikipedia:  npm run sync:challengers -- 2023 [2024 ...]
import { createAdminClient } from "@/lib/supabase/admin";
import { importChallengers } from "@/lib/sync/challengers";

const seasons = process.argv.slice(2).map(Number).filter(Boolean);
const started = Date.now();
console.log(await importChallengers(createAdminClient(), seasons.length ? seasons : [new Date().getUTCFullYear()]), `${((Date.now() - started) / 1000).toFixed(1)}s`);
