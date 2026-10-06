// Guided setup for the accounts only you can sign in to: Discord webhook, Bluesky bot, Bing and the
// Discord bot. Opens each page, takes pasted values without echoing them, checks they work, saves
// them to .env.local and Vercel (production), and redeploys once at the end. Never prints a secret.
// Run it in a terminal window (it asks questions):  npm run setup
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const PROJECT = "baseline-today";
const SITE = "https://baseline-today.vercel.app";
const win = process.platform === "win32";
let changed = false;

// ---------- terminal helpers ----------
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
let muted = false;
rl._writeToOutput = (s) => {
  if (!muted) process.stdout.write(s);
  else if (s.includes("\n")) rl.output.write("\n");
};
// Lines are queued, so answers typed (or piped) ahead of a question are never lost.
const lines = [];
const waiting = [];
let closed = false;
rl.on("line", (l) => (waiting.length ? waiting.shift()(l) : lines.push(l)));
rl.on("close", () => {
  closed = true;
  while (waiting.length) waiting.shift()("");
});
const nextLine = () => (lines.length ? Promise.resolve(lines.shift()) : closed ? Promise.resolve("") : new Promise((r) => waiting.push(r)));
async function ask(q) {
  process.stdout.write(q);
  return (await nextLine()).trim();
}
async function secret(q) {
  process.stdout.write(q);
  muted = true;
  const a = await nextLine();
  muted = false;
  process.stdout.write("(received)\n");
  return a.trim();
}
const yes = async (q) => /^y/i.test(await ask(`${q} [y/N] `));
const step = (n, title) => console.log(`\n━━━ ${n}. ${title} ━━━`);

function open(url) {
  if (win) spawnSync("cmd.exe", ["/d", "/c", "start", "", url], { stdio: "ignore" });
  else spawnSync(process.platform === "darwin" ? "open" : "xdg-open", [url], { stdio: "ignore" });
  console.log(`  Opened ${url}`);
}

function run(cmd, args, input) {
  const [c, a] = win ? ["cmd.exe", ["/d", "/c", cmd, ...args]] : [cmd, args];
  return spawnSync(c, a, { input, encoding: "utf8", stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"] });
}

// ---------- env helpers ----------
function writeLocal(vars) {
  const lines = existsSync(".env.local") ? readFileSync(".env.local", "utf8").split(/\r?\n/) : [];
  for (const [name, value] of Object.entries(vars)) {
    const i = lines.findIndex((l) => l.startsWith(`${name}=`));
    if (i >= 0) lines[i] = `${name}=${value}`;
    else lines.splice(lines.at(-1) === "" ? lines.length - 1 : lines.length, 0, `${name}=${value}`);
  }
  writeFileSync(".env.local", lines.join("\n").replace(/\n*$/, "\n"));
}
function saveVercel(name, value, sensitive) {
  const r = run("vercel", ["env", "add", name, "production", "--project", PROJECT, "--force", "--yes", sensitive ? "--sensitive" : "--no-sensitive"], value);
  if (r.status !== 0) throw new Error(`Vercel rejected ${name}: ${(r.stderr || "").replaceAll(value, "***").trim().split("\n").pop()}`);
  changed = true;
  console.log(`  ✓ ${name} saved${sensitive ? " (sensitive)" : ""}`);
}
function inVercel() {
  const r = run("vercel", ["env", "ls", "production", "--project", PROJECT], "");
  return new Set([...(r.stdout ?? "").matchAll(/^\s*([A-Z0-9_]+)\s/gm)].map((m) => m[1]));
}

// ---------- steps ----------
const webhookKind = (url) => {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if ((u.hostname === "discord.com" || u.hostname === "discordapp.com") && u.pathname.startsWith("/api/webhooks/")) return "discord";
    if (u.hostname === "hooks.slack.com" && u.pathname.startsWith("/services/")) return "slack";
  } catch {}
  return null;
};

async function discordWebhook(have) {
  step(1, "Discord channel for the daily digest and job alerts");
  if (have.has("DIGEST_WEBHOOK_URLS") && !(await yes("  Already set. Replace it?"))) return;
  console.log("  In Discord: your server → Server Settings → Integrations → Webhooks → New Webhook,");
  console.log("  pick the channel, then Copy Webhook URL. (Press Enter on an empty line to skip.)");
  if (await yes("  Open Discord in the browser?")) open("https://discord.com/app");
  for (;;) {
    const url = await secret("  Paste the webhook URL (hidden): ");
    if (!url) return console.log("  Skipped.");
    if (!webhookKind(url)) {
      console.log("  ✗ That isn't a Discord or Slack webhook address. Copy it again.");
      continue;
    }
    const body = webhookKind(url) === "slack" ? { text: "✅ Baseline Today is connected." } : { content: "✅ Baseline Today is connected. The daily digest and job alerts will post here.", allowed_mentions: { parse: [] } };
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res?.ok) {
      console.log(`  ✗ Test message failed (HTTP ${res?.status ?? "no response"}). Check the webhook still exists.`);
      continue;
    }
    console.log("  ✓ Test message posted. Check the channel.");
    writeLocal({ DIGEST_WEBHOOK_URLS: url });
    saveVercel("DIGEST_WEBHOOK_URLS", url, true);
    return;
  }
}

async function bluesky(have) {
  step(2, "Bluesky bot (posts the upset of the day and the weekly recap)");
  if (have.has("BLUESKY_HANDLE") && have.has("BLUESKY_APP_PASSWORD") && !(await yes("  Already set. Replace it?"))) return;
  console.log("  a) Create the account (e.g. baselinetoday.bsky.social) at bsky.app, if you haven't.");
  console.log("  b) Settings → Privacy and security → App passwords → Add App Password, and copy it.");
  console.log("     (Use an app password, never the account password.) Enter on an empty line skips.");
  if (await yes("  Open Bluesky in the browser?")) {
    open("https://bsky.app");
    open("https://bsky.app/settings/app-passwords");
  }
  for (;;) {
    const handle = (await ask("  Handle (e.g. baselinetoday.bsky.social): ")).replace(/^@/, "");
    if (!handle) return console.log("  Skipped.");
    const password = await secret("  App password (hidden): ");
    const res = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: handle, password }),
    }).catch(() => null);
    if (!res?.ok) {
      console.log(`  ✗ Login failed (HTTP ${res?.status ?? "no response"}). Check the handle and that it's an app password.`);
      continue;
    }
    console.log("  ✓ Bluesky login works");
    writeLocal({ BLUESKY_HANDLE: handle, BLUESKY_APP_PASSWORD: password });
    saveVercel("BLUESKY_HANDLE", handle, false);
    saveVercel("BLUESKY_APP_PASSWORD", password, true);
    const profile = run("npm", ["run", "-s", "bluesky:profile"], "");
    console.log(`  ✓ Profile: ${(profile.stdout || profile.stderr).trim().split("\n").pop()} ("Baseline Today (bot)", automated-account bio)`);
    if (await yes("  Post the intro and pin it now (it says it's an automated account)?")) {
      const intro = run("npm", ["run", "-s", "bluesky:intro"], "");
      console.log(`  ${intro.status === 0 ? "✓" : "✗"} ${(intro.stdout || intro.stderr).trim().split("\n").pop()}`);
    }
    return;
  }
}

async function bing() {
  step(3, "Bing Webmaster Tools");
  console.log("  Sign in, choose “Import from Google Search Console”, pick baseline-today.vercel.app.");
  if (!(await yes("  Open Bing Webmaster Tools?"))) return console.log("  Skipped.");
  open("https://www.bing.com/webmasters");
  await ask("  Press Enter when the import is done… ");
}

async function discordBot(have) {
  step(4, "Discord bot with /odds, /rankings, /results (optional)");
  if (!(await yes(have.has("DISCORD_PUBLIC_KEY") ? "  Already set. Set it up again?" : "  Set up the bot now?"))) return null;
  console.log("  At discord.com/developers/applications: New Application → name it “Baseline Today”.");
  open("https://discord.com/developers/applications");
  const appId = await ask("  General Information → Application ID: ");
  const publicKey = await ask("  General Information → Public Key: ");
  console.log("  Bot → Reset Token → copy it.");
  const token = await secret("  Bot token (hidden): ");
  if (!/^\d{15,22}$/.test(appId) || !/^[0-9a-f]{64}$/i.test(publicKey) || token.length < 50) {
    console.log("  ✗ Those don't look right (Application ID is digits, Public Key 64 hex characters). Skipped.");
    return null;
  }
  const me = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bot ${token}` } }).catch(() => null);
  if (!me?.ok) {
    console.log(`  ✗ The bot token was rejected (HTTP ${me?.status ?? "no response"}). Skipped.`);
    return null;
  }
  console.log("  ✓ Bot token works");
  writeLocal({ DISCORD_APP_ID: appId, DISCORD_PUBLIC_KEY: publicKey, DISCORD_BOT_TOKEN: token });
  saveVercel("DISCORD_PUBLIC_KEY", publicKey, false);
  return appId;
}

// ---------- main ----------
console.log("Baseline Today setup. Each step can be skipped; secrets are never shown or printed.");
if (run("vercel", ["whoami"], "").status !== 0) {
  console.log("✗ The Vercel CLI isn't signed in. Run `vercel login` first.");
  process.exit(1);
}
const have = inVercel();
try {
  await discordWebhook(have);
  await bluesky(have);
  await bing();
  const appId = await discordBot(have);

  if (changed) {
    console.log("\nRedeploying production so the new settings take effect (about a minute)…");
    const r = run("vercel", ["redeploy", "baseline-today.vercel.app", "--target", "production"], "");
    console.log(r.status === 0 ? "✓ Redeployed" : `✗ Redeploy failed: ${(r.stderr || "").trim().split("\n").pop()}`);
  }
  if (appId) {
    console.log(`\nDiscord bot, last part:`);
    console.log(`  1. General Information → Interactions Endpoint URL: ${SITE}/api/discord → Save Changes`);
    await ask("     Press Enter once Discord saved it… ");
    const reg = run("node", ["scripts/discord-register.mjs"], "");
    console.log(`  ${(reg.stdout || reg.stderr).trim().split("\n").join("\n  ")}`);
    console.log("  2. Open the invite link above to add the bot to your server.");
  }
  console.log("\nAll done. Tell Claude, and it will check everything.");
} catch (err) {
  console.log(`\n✗ ${err.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
