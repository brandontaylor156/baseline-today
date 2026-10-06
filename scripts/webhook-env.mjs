// Saves DIGEST_WEBHOOK_URLS from .env.local to the baseline-today Vercel project (production) and
// posts one test message to each webhook. The URLs go to the Vercel CLI over stdin; none are printed.
//   node scripts/webhook-env.mjs
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROJECT = "baseline-today";
const NAME = "DIGEST_WEBHOOK_URLS";

const line = readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith(`${NAME}=`));
const value = line?.slice(NAME.length + 1).trim().replace(/^"|"$/g, "") ?? "";
const urls = value.split(",").map((s) => s.trim()).filter(Boolean);
if (urls.length === 0) {
  console.error(`Add ${NAME}=<your webhook URL> to .env.local first.`);
  process.exit(1);
}

// Same rule as the app (src/lib/digest.ts): only https Discord or Slack webhook addresses.
const kind = (url) => {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if ((u.hostname === "discord.com" || u.hostname === "discordapp.com") && u.pathname.startsWith("/api/webhooks/")) return "discord";
    if (u.hostname === "hooks.slack.com" && u.pathname.startsWith("/services/")) return "slack";
  } catch {}
  return null;
};
const bad = urls.filter((u) => !kind(u)).length;
if (bad) {
  console.error(`✗ ${bad} of ${urls.length} URL(s) isn't a Discord or Slack webhook address. Copy it again from the webhook settings.`);
  process.exit(1);
}

const args = ["env", "add", NAME, "production", "--project", PROJECT, "--force", "--yes", "--sensitive"];
const result = spawnSync("vercel", args, { input: value, shell: process.platform === "win32", stdio: ["pipe", "ignore", "pipe"] });
if (result.status !== 0) {
  let msg = result.stderr.toString();
  for (const u of urls) msg = msg.replaceAll(u, "***");
  console.error(`✗ Vercel: ${msg.trim().split("\n").pop()}`);
  process.exit(1);
}
console.log(`✓ ${NAME} saved in Vercel (sensitive)`);

const text = "✅ Baseline Today is connected. The daily digest and job alerts will post here.";
let ok = 0;
for (const url of urls) {
  const body = kind(url) === "slack" ? { text } : { content: text, allowed_mentions: { parse: [] } };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (res?.ok) ok++;
}
console.log(ok === urls.length ? `✓ Test message sent (${ok}). Tell Claude it's done.` : `✗ Test message failed for ${urls.length - ok} webhook(s): check the channel's webhook still exists.`);
process.exitCode = ok === urls.length ? 0 : 1;
