// Junior Grand Slam singles draws from Wikipedia:  npm run sync:juniors -- 2016 [2017 ...]
import { createAdminClient } from "@/lib/supabase/admin";
import { importJuniors } from "@/lib/sync/challengers";

const seasons = process.argv.slice(2).map(Number).filter(Boolean);
const started = Date.now();
console.log(await importJuniors(createAdminClient(), seasons.length ? seasons : [new Date().getUTCFullYear()]), `${((Date.now() - started) / 1000).toFixed(1)}s`);
