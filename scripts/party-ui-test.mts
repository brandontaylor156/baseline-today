// Browser check of a watch party with two throwaway accounts (deleted at the end): the host keeps
// score and chats, the guest's page must update live. Screenshots go to the given folder.
//   npx tsx --env-file=.env.local scripts/party-ui-test.mts <match id> <screenshot dir>
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ref = new URL(url).hostname.split(".")[0];
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const [matchId, out] = [Number(process.argv[2]), process.argv[3]];
const base = "http://localhost:3100";
const created: string[] = [];

async function session(label: string) {
  const email = `party-ui-${label}-${Date.now()}@test.invalid`;
  const { data: u } = await admin.auth.admin.createUser({ email, email_confirm: true });
  created.push(u.user!.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data } = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.properties!.hashed_token });
  return { client, session: data.session! };
}

// @supabase/ssr's cookie: "base64-" + base64url(JSON session), split into .0/.1… chunks over 3180 chars.
function cookies(session: object) {
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const name = `sb-${ref}-auth-token`;
  const chunks = value.match(/.{1,3180}/g)!;
  return (chunks.length === 1 ? [{ name, value }] : chunks.map((v, i) => ({ name: `${name}.${i}`, value: v }))).map((c) => ({ ...c, url: base }));
}

const log: string[] = [];
const browser = await chromium.launch();
try {
  const host = await session("host");
  const guest = await session("guest");
  const { data: code } = await host.client.rpc("create_party", { p_match_id: matchId, p_nickname: "Hosty" });
  await guest.client.rpc("join_party", { p_code: code, p_nickname: "Guesty" });

  const hostCtx = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  await hostCtx.addCookies(cookies(host.session));
  const guestCtx = await browser.newContext({ viewport: { width: 390, height: 1100 } });
  await guestCtx.addCookies(cookies(guest.session));
  const hp = await hostCtx.newPage();
  const gp = await guestCtx.newPage();
  await Promise.all([hp.goto(`${base}/party/${code}`), gp.goto(`${base}/party/${code}`)]);
  await hp.getByRole("heading", { level: 1 }).waitFor({ timeout: 20000 });
  await gp.getByRole("heading", { level: 1 }).waitFor({ timeout: 20000 });
  await hp.waitForTimeout(3000); // let both channels subscribe

  // Host: a call, ten points and a chat message; guest should see them without reloading.
  await hp.getByRole("button", { name: /^Point / }).first().waitFor();
  const pointA = hp.getByRole("button", { name: /^Point / }).first();
  const pointB = hp.getByRole("button", { name: /^Point / }).nth(1);
  for (const side of [1, 1, 1, 1, 2, 2, 1, 2, 2, 2, 2, 1, 1, 1, 1]) await (side === 1 ? pointA : pointB).click();
  await hp.getByRole("textbox", { name: "Message" }).fill("Come on!");
  await hp.getByRole("button", { name: "Send" }).click();
  await hp.getByRole("button", { name: "React 🔥" }).click();
  await gp.getByText("Come on!").waitFor({ timeout: 10000 });
  log.push("guest received chat");
  await gp.waitForFunction(() => document.body.innerText.includes("Hosty"), null, { timeout: 5000 });
  const guestScore = await gp.locator('section[aria-label="Score"]').innerText();
  log.push(`guest scoreboard: ${guestScore.replace(/\s+/g, " ").slice(0, 120)}`);
  log.push(`overflow host ${await hp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)}, guest ${await gp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)}`);
  await hp.screenshot({ path: `${out}/party-host.png`, fullPage: true });
  await gp.screenshot({ path: `${out}/party-guest.png`, fullPage: true });
  await host.client.from("parties").delete().eq("code", code);
} catch (err) {
  log.push(`ERROR ${err instanceof Error ? err.message : err}`);
} finally {
  await browser.close();
  for (const id of created) await admin.auth.admin.deleteUser(id);
  log.push(`deleted ${created.length} test users`);
}
console.log(log.join("\n"));
process.exit(0);
