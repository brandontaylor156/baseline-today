// Backfill or refresh Wikimedia photos locally:  npm run sync:photos [-- 200]
import { createAdminClient } from "@/lib/supabase/admin";
import { runPhotoSync } from "@/lib/sync/photos";

const limit = Number(process.argv[2] ?? 200);
console.log(JSON.stringify(await runPhotoSync(createAdminClient(), limit), null, 2));
