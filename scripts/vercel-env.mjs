// Copies production environment variables from .env.local to the baseline-today Vercel project,
// and generates a fresh CRON_SECRET. Values go to the Vercel CLI over stdin; nothing is printed.
//   node scripts/vercel-env.mjs
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const PROJECT = "baseline-today";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const vars = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", value: env.NEXT_PUBLIC_SUPABASE_URL, sensitive: false },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", value: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, sensitive: false },
  { name: "SUPABASE_SECRET_KEY", value: env.SUPABASE_SECRET_KEY, sensitive: true },
  { name: "BALLDONTLIE_API_KEY", value: env.BALLDONTLIE_API_KEY, sensitive: true },
  { name: "CRON_SECRET", value: randomBytes(32).toString("base64url"), sensitive: true },
];

let failed = 0;
for (const { name, value, sensitive } of vars) {
  if (!value) {
    console.error(`✗ ${name}: missing from .env.local`);
    failed++;
    continue;
  }
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
