// Prints what the Bluesky bot would post today, without posting:  npm run bluesky:preview [-- 2026-10-05]
import { botPosts } from "@/lib/bluesky";
import { clip300 } from "@/lib/bluesky-text";
import { SITE_URL } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

const at = process.argv[2] ? new Date(`${process.argv[2]}T06:00:00Z`) : new Date();
const posts = await botPosts(createAdminClient(), at);
if (posts.length === 0) console.log("Nothing to post today.");
for (const p of posts) {
  console.log(`--- ${p.key}\n${clip300(p.text)}\n[card] ${p.link.title} · ${SITE_URL}${p.link.path}\n`);
}
