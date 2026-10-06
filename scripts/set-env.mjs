// Copies the named variables from .env.local to the baseline-today Vercel project (production) over
// stdin, printing only names. Checks the Bluesky login when its two variables are included.
//   node scripts/set-env.mjs BLUESKY_HANDLE BLUESKY_APP_PASSWORD GOOGLE_SITE_VERIFICATION
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROJECT = "baseline-today";
// Public by design (verification codes are served in the page); everything else is stored as sensitive.
const PUBLIC = new Set(["GOOGLE_SITE_VERIFICATION", "BING_SITE_VERIFICATION", "BLUESKY_HANDLE"]);

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("Usage: node scripts/set-env.mjs NAME [NAME...]");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);

const missing = names.filter((n) => !env[n]);
if (missing.length) {
  console.error(`✗ Missing from .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

if (names.includes("BLUESKY_HANDLE") || names.includes("BLUESKY_APP_PASSWORD")) {
  if (!env.BLUESKY_HANDLE || !env.BLUESKY_APP_PASSWORD) {
    console.error("✗ Set both BLUESKY_HANDLE and BLUESKY_APP_PASSWORD.");
    process.exit(1);
  }
  const res = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: env.BLUESKY_HANDLE.replace(/^@/, ""), password: env.BLUESKY_APP_PASSWORD }),
  }).catch(() => null);
  if (!res?.ok) {
    console.error(`✗ Bluesky login failed (HTTP ${res?.status ?? "no response"}). Check the handle and that the password is an app password.`);
    process.exit(1);
  }
  console.log("✓ Bluesky login works");
  env.BLUESKY_HANDLE = env.BLUESKY_HANDLE.replace(/^@/, "");
}

let failed = 0;
for (const name of names) {
  const sensitive = !PUBLIC.has(name);
  const args = ["env", "add", name, "production", "--project", PROJECT, "--force", "--yes", sensitive ? "--sensitive" : "--no-sensitive"];
  const result = spawnSync("vercel", args, { input: env[name], shell: process.platform === "win32", stdio: ["pipe", "ignore", "pipe"] });
  if (result.status === 0) console.log(`✓ ${name}${sensitive ? " (sensitive)" : ""}`);
  else {
    failed++;
    console.error(`✗ ${name}: ${result.stderr.toString().replaceAll(env[name], "***").trim().split("\n").pop()}`);
  }
}
console.log(failed ? `\n${failed} failed.` : "\nAll set. Tell Claude it's done so it can redeploy.");
process.exitCode = failed ? 1 : 0;
