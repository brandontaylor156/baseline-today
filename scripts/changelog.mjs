// Writes src/data/changelog.json from git history (subjects and "- " bullets of each commit body),
// for the /changelog page. Run before committing a release:  npm run changelog
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const SEP = "\u001e";
const log = execFileSync("git", ["log", "--no-merges", `--pretty=format:%h%x1f%ad%x1f%s%x1f%b${SEP}`, "--date=short"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

const entries = log
  .split(SEP)
  .map((chunk) => chunk.trim())
  .filter(Boolean)
  .map((chunk) => {
    const [hash, date, subject, body = ""] = chunk.split("\u001f");
    // Bullets from the body; continuation lines join the bullet above. Attribution lines are dropped.
    const bullets = [];
    for (const line of body.split(/\r?\n/)) {
      if (/^(Co-Authored-By|Claude-Session):/i.test(line)) continue;
      if (/^\s*- /.test(line)) bullets.push(line.replace(/^\s*- /, "").trim());
      else if (/^\s{2,}\S/.test(line) && bullets.length) bullets[bullets.length - 1] += ` ${line.trim()}`;
    }
    return { hash, date, subject: subject.trim(), bullets };
  });

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/changelog.json", `${JSON.stringify(entries, null, 1)}\n`);
console.log(`✓ ${entries.length} commits written to src/data/changelog.json`);
