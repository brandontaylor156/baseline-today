// Playing hand, backhand and height from Wikidata (weekly):  npm run sync:traits
import { createAdminClient } from "@/lib/supabase/admin";
import { syncTraits } from "@/lib/sync/traits";

console.log(await syncTraits(createAdminClient()));
