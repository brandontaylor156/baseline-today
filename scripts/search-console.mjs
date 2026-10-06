// Google Search Console from the terminal, using your Google sign-in through gcloud
// (Application Default Credentials). Prints no tokens.
//
//   node scripts/search-console.mjs login                                  one-time Google sign-in (opens the browser)
//   node scripts/search-console.mjs setup [--project <gcp-project-id>]   verify, add the site, submit the sitemap
//   node scripts/search-console.mjs status                                 property, sitemap and index status
//   node scripts/search-console.mjs report [days]                          top searches and pages (default 28 days)
//   node scripts/search-console.mjs inspect <path>                         is this page indexed?
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SITE = "https://baseline-today.vercel.app/";
const PROJECT = "baseline-today"; // Vercel project
const APIS = ["siteverification.googleapis.com", "searchconsole.googleapis.com"];
const win = process.platform === "win32";
const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/siteverification",
  "https://www.googleapis.com/auth/webmasters",
];

/** [command, args] for gcloud. On Windows it's a .cmd under "Cloud SDK": run it via cmd.exe so Node quotes the path. */
function gcloud(args) {
  if (!win) return ["gcloud", args];
  const local = join(process.env.LOCALAPPDATA ?? "", "Google", "Cloud SDK", "google-cloud-sdk", "bin", "gcloud.cmd");
  return ["cmd.exe", ["/d", "/c", existsSync(local) ? local : "gcloud", ...args]];
}

function token() {
  try {
    return execFileSync(...gcloud(["auth", "application-default", "print-access-token"]), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    console.error("✗ Not signed in. Run: npm run search -- login");
    process.exit(1);
  }
}

// The Google Cloud project that pays the (free) API quota: the one behind Google sign-in.
let quotaProject = process.env.GOOGLE_QUOTA_PROJECT ?? "baseline-today";
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(quotaProject ? { "x-goog-user-project": quotaProject } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${url.replace(/\?.*/, "")}: HTTP ${res.status} ${data.error?.message ?? text.slice(0, 300)}`);
  return data;
}

const site = encodeURIComponent(SITE);
const wm = `https://www.googleapis.com/webmasters/v3/sites/${site}`;

async function pickProject(arg) {
  if (arg) return arg;
  if (quotaProject) return quotaProject;
  const { projects = [] } = await api("GET", "https://cloudresourcemanager.googleapis.com/v1/projects?filter=lifecycleState:ACTIVE");
  if (projects.length === 1) return projects[0].projectId;
  console.error(
    projects.length
      ? `Several Google Cloud projects; pick one with --project:\n${projects.map((p) => `  ${p.projectId}  (${p.name})`).join("\n")}`
      : "No Google Cloud project found; create one at https://console.cloud.google.com/projectcreate and pass --project.",
  );
  process.exit(1);
}

function vercel(args, input) {
  const [cmd, full] = win ? ["cmd.exe", ["/d", "/c", "vercel", ...args]] : ["vercel", args];
  const r = spawnSync(cmd, full, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  if (r.status !== 0) throw new Error(`vercel ${args[0]}: ${(r.stderr || r.stdout).trim().split("\n").pop()}`);
  return r.stdout;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup(argv) {
  const i = argv.indexOf("--project");
  quotaProject = await pickProject(i >= 0 ? argv[i + 1] : null);
  console.log(`• Google Cloud project for API quota: ${quotaProject}`);

  // 1. Turn on the two APIs in that project (no-op if they're on).
  const op = await api("POST", `https://serviceusage.googleapis.com/v1/projects/${quotaProject}/services:batchEnable`, { serviceIds: APIS });
  for (let n = 0; !op.done && op.name && n < 20; n++) {
    await sleep(3000);
    Object.assign(op, await api("GET", `https://serviceusage.googleapis.com/v1/${op.name}`));
  }
  console.log("✓ Site Verification and Search Console APIs enabled");

  // 2. Already verified? Then skip straight to the property.
  const owned = await api("GET", "https://www.googleapis.com/siteVerification/v1/webResource").catch(() => ({ items: [] }));
  const verified = (owned.items ?? []).some((r) => r.site?.identifier === SITE);
  if (!verified) {
    const { token: tag } = await api("POST", "https://www.googleapis.com/siteVerification/v1/token", { site: { type: "SITE", identifier: SITE }, verificationMethod: "META" });
    const code = /content="([^"]+)"/.exec(tag)?.[1];
    if (!code) throw new Error("Google returned no verification code");

    // 3. Serve it: Vercel env var (public by design) and a production redeploy.
    const live = await fetch(SITE).then((r) => r.text());
    if (!live.includes(code)) {
      vercel(["env", "add", "GOOGLE_SITE_VERIFICATION", "production", "--project", PROJECT, "--force", "--yes", "--no-sensitive"], code);
      console.log("✓ GOOGLE_SITE_VERIFICATION saved in Vercel; redeploying production (about a minute)…");
      vercel(["redeploy", "baseline-today.vercel.app", "--target", "production"]);
      for (let n = 0; n < 40; n++) {
        if ((await fetch(SITE, { cache: "no-store" }).then((r) => r.text())).includes(code)) break;
        await sleep(15_000);
      }
    }
    if (!(await fetch(SITE, { cache: "no-store" }).then((r) => r.text())).includes(code)) throw new Error("The verification tag isn't live yet; run setup again in a few minutes.");
    console.log("✓ Verification tag is live on the homepage");

    // 4. Verify ownership.
    await api("POST", "https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=META", { site: { type: "SITE", identifier: SITE } });
  }
  console.log("✓ Ownership verified");

  // 5. Add the property and submit the sitemap.
  await api("PUT", wm);
  console.log("✓ Property added to Search Console");
  await api("PUT", `${wm}/sitemaps/${encodeURIComponent(`${SITE}sitemap.xml`)}`);
  console.log("✓ sitemap.xml submitted");
  console.log(`\nDone. Open https://search.google.com/search-console?resource_id=${site}\nFirst data usually appears within a few days. Check progress with: npm run search -- status`);
}

async function status() {
  quotaProject = await pickProject(null);
  const { siteEntry = [] } = await api("GET", "https://www.googleapis.com/webmasters/v3/sites");
  const me = siteEntry.find((s) => s.siteUrl === SITE);
  console.log(`Property: ${me ? `${SITE} (${me.permissionLevel})` : "not added yet: run setup"}`);
  if (!me) return;
  const { sitemap = [] } = await api("GET", `${wm}/sitemaps`);
  for (const s of sitemap) {
    const urls = (s.contents ?? []).reduce((n, c) => n + Number(c.submitted ?? 0), 0);
    console.log(`Sitemap ${s.path}: ${s.isPending ? "pending" : "processed"}, last read ${s.lastDownloaded ?? "not yet"}, ${urls} URLs submitted, ${s.errors ?? 0} errors, ${s.warnings ?? 0} warnings`);
  }
}

async function report(days = 28) {
  quotaProject = await pickProject(null);
  const end = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10); // data lags ~2 days
  const start = new Date(Date.now() - (days + 2) * 86_400_000).toISOString().slice(0, 10);
  for (const dim of ["query", "page"]) {
    const { rows = [] } = await api("POST", `${wm}/searchAnalytics/query`, { startDate: start, endDate: end, dimensions: [dim], rowLimit: 15 });
    console.log(`\nTop ${dim === "query" ? "searches" : "pages"}, ${start} to ${end}:`);
    if (rows.length === 0) console.log("  (no data yet)");
    for (const r of rows) {
      const key = dim === "page" ? r.keys[0].replace(SITE, "/") : r.keys[0];
      console.log(`  ${String(r.clicks).padStart(5)} clicks ${String(r.impressions).padStart(7)} views  pos ${r.position.toFixed(1).padStart(5)}  ${key}`);
    }
  }
}

async function inspect(path = "/") {
  quotaProject = await pickProject(null);
  const url = new URL(path, SITE).toString();
  const { inspectionResult: r } = await api("POST", "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", { inspectionUrl: url, siteUrl: SITE });
  const idx = r?.indexStatusResult ?? {};
  console.log(`${url}\n  verdict: ${idx.verdict ?? "?"}\n  coverage: ${idx.coverageState ?? "?"}\n  last crawl: ${idx.lastCrawlTime ?? "never"}\n  Google's canonical: ${idx.googleCanonical ?? "-"}`);
}

const [cmd, ...rest] = process.argv.slice(2);
function login() {
  const r = spawnSync(...gcloud(["auth", "application-default", "login", `--scopes=${SCOPES.join(",")}`]), { stdio: "inherit" });
  if (r.status === 0) console.log("\n✓ Signed in. Tell Claude, or run: npm run search -- setup");
  process.exit(r.status ?? 1);
}

const run = { login: async () => login(), setup: () => setup(rest), status, report: () => report(Number(rest[0]) || 28), inspect: () => inspect(rest[0]) }[cmd];
if (!run) {
  console.log("Usage: npm run search -- login | setup [--project ID] | status | report [days] | inspect <path>");
  process.exit(1);
}
run().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
