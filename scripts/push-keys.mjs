// Generates the VAPID key pair for push notifications, writes it to .env.local and to the
// baseline-today Vercel project (production). Values go to files and the Vercel CLI over stdin;
// nothing is printed. Running it again replaces the keys, which signs out every subscribed browser.
//   node scripts/push-keys.mjs
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import webpush from "web-push";

const PROJECT = "baseline-today";
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
const vars = [
  { name: "VAPID_PUBLIC_KEY", value: publicKey, sensitive: false },
  { name: "VAPID_PRIVATE_KEY", value: privateKey, sensitive: true },
];

// .env.local: replace existing lines, or append.
const path = ".env.local";
let lines = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
for (const { name, value } of vars) {
  const i = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (i >= 0) lines[i] = `${name}=${value}`;
  else lines.splice(lines.at(-1) === "" ? lines.length - 1 : lines.length, 0, `${name}=${value}`);
}
writeFileSync(path, lines.join("\n").replace(/\n*$/, "\n"));
console.log("✓ .env.local");

let failed = 0;
for (const { name, value, sensitive } of vars) {
  const args = ["env", "add", name, "production", "--project", PROJECT, "--force", "--yes", sensitive ? "--sensitive" : "--no-sensitive"];
  const result = spawnSync("vercel", args, { input: value, shell: process.platform === "win32", stdio: ["pipe", "ignore", "pipe"] });
  if (result.status === 0) {
    console.log(`✓ ${name}${sensitive ? " (sensitive)" : ""}`);
  } else {
    failed++;
    console.error(`✗ ${name}: ${result.stderr.toString().replaceAll(value, "***").trim().split("\n").pop()}`);
  }
}
console.log(failed ? `\n${failed} failed.` : "\nAll set. Tell Claude it's done.");
process.exitCode = failed ? 1 : 0;
