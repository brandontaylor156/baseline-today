// Birth dates for players known only by name, from Wikidata:  npm run sync:people -- [limit]
import { createAdminClient } from "@/lib/supabase/admin";
import { syncPeople } from "@/lib/sync/people";

console.log(await syncPeople(createAdminClient(), Number(process.argv[2] ?? 400)));
