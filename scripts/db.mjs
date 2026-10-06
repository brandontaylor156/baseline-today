// Runs SQL against the baseline-today Supabase database through the connection pooler. The database
// password comes from Windows Credential Manager (generic credential "baseline-today/supabase-db",
// or SUPABASE_DB_PASSWORD) and is never printed.
//   node scripts/db.mjs file supabase/migrations/<file>.sql     apply a migration (idempotent SQL)
//   node scripts/db.mjs query "select count(*) from public.matches"
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import postgres from "postgres";

const REF = "ypcjcendsvlssuoiiwsq";
const HOSTS = ["aws-0-us-east-1.pooler.supabase.com", "aws-1-us-east-1.pooler.supabase.com"];
const CREDENTIAL = "baseline-today/supabase-db";

function password() {
  if (process.env.SUPABASE_DB_PASSWORD) return process.env.SUPABASE_DB_PASSWORD;
  if (process.platform !== "win32") throw new Error("Set SUPABASE_DB_PASSWORD");
  const ps = `
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class Cred { [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct C { public int Flags; public int Type; public string TargetName; public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME W; public int Size; public IntPtr Blob; public int Persist; public int AC; public IntPtr A; public string TA; public string UN; }
[DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool CredRead(string t, int ty, int f, out IntPtr c);
public static string Get(string t) { IntPtr p; if (!CredRead(t, 1, 0, out p)) return ""; var c = (C)Marshal.PtrToStructure(p, typeof(C)); var b = new byte[c.Size]; Marshal.Copy(c.Blob, b, 0, c.Size); var s = System.Text.Encoding.Unicode.GetString(b); if (s.Length * 2 != b.Length || s.IndexOf((char)0) >= 0) s = System.Text.Encoding.UTF8.GetString(b); return s; } }
"@
[Console]::Out.Write([Cred]::Get("${CREDENTIAL}"))`;
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (!out) throw new Error(`No "${CREDENTIAL}" credential in Windows Credential Manager`);
  return out;
}

async function connect() {
  const pass = password();
  let last;
  for (const host of HOSTS) {
    const sql = postgres({ host, port: 5432, database: "postgres", username: `postgres.${REF}`, password: pass, ssl: "require", max: 1, connect_timeout: 15, onnotice: () => {} });
    try {
      await sql`select 1`;
      return sql;
    } catch (err) {
      last = err;
      await sql.end({ timeout: 1 }).catch(() => {});
    }
  }
  throw new Error(`could not connect: ${String(last?.message ?? last).replaceAll(pass, "***")}`);
}

const [cmd, arg] = process.argv.slice(2);
if (!["file", "query"].includes(cmd) || !arg) {
  console.log('Usage: node scripts/db.mjs file <path.sql> | query "<sql>"');
  process.exit(1);
}
const sql = await connect();
try {
  const text = cmd === "file" ? readFileSync(arg, "utf8") : arg;
  const result = await sql.unsafe(text).simple();
  const sets = Array.isArray(result[0]) || result.length === 0 ? result : [result];
  const last = [...sets].reverse().find((r) => Array.isArray(r) && r.length) ?? [];
  console.log(cmd === "file" ? `✓ applied ${arg}` : JSON.stringify([...last], null, 0));
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
