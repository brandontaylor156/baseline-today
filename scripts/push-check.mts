// Checks that result notifications are switched on: a throwaway account (deleted at the end) with one
// favorite should see the "Result notifications" toggle on My players.
//   npx tsx --env-file=.env.local scripts/push-check.mts [base URL]
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ref = new URL(url).hostname.split(".")[0];
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const base = process.argv[2] ?? "http://localhost:3100";

const email = `push-check-${Date.now()}@test.invalid`;
const { data: u } = await admin.auth.admin.createUser({ email, email_confirm: true });
const userId = u.user!.id;
let ok = false;
try {
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data } = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.properties!.hashed_token });
  const auth = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  });
  const { data: top } = await admin.from("rankings").select("player_id").eq("tour", "atp").order("ranking_date", { ascending: false }).order("rank").limit(1).single();
  const { error } = await auth.from("favorites").insert({ player_id: top!.player_id });
  if (error) throw new Error(`favorite: ${error.message}`);

  // @supabase/ssr's cookie: "base64-" + base64url(JSON session), chunked over 3180 chars.
  const value = `base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;
  const name = `sb-${ref}-auth-token`;
  const chunks = value.match(/.{1,3180}/g)!;
  const cookies = (chunks.length === 1 ? [{ name, value }] : chunks.map((v, i) => ({ name: `${name}.${i}`, value: v }))).map((c) => ({ ...c, url: base }));

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto(`${base}/my-players`);
  ok = await page
    .getByText("Result notifications")
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!ok) console.log(`page shows: ${(await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 300)}`);
  await browser.close();
} finally {
  await admin.auth.admin.deleteUser(userId);
}
console.log(ok ? "✓ Result notifications toggle is showing (push is on)" : "✗ No notifications toggle: check VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in Vercel and redeploy");
process.exit(ok ? 0 : 1);
