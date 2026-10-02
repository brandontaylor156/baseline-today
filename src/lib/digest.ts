import "server-only";

import { digestText } from "@/lib/bot";

/** Only chat webhooks: the URLs come from configuration, but never let them point elsewhere. */
export function webhookKind(url: string): "discord" | "slack" | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if ((u.hostname === "discord.com" || u.hostname === "discordapp.com") && u.pathname.startsWith("/api/webhooks/")) return "discord";
    if (u.hostname === "hooks.slack.com" && u.pathname.startsWith("/services/")) return "slack";
    return null;
  } catch {
    return null;
  }
}

/** Posts the daily digest to every webhook in DIGEST_WEBHOOK_URLS (comma-separated). */
export async function sendDigest(): Promise<{ sent: number; skipped: number } | null> {
  const urls = (process.env.DIGEST_WEBHOOK_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (urls.length === 0) return null;
  const text = await digestText();
  let sent = 0;
  let skipped = 0;
  for (const url of urls) {
    const kind = webhookKind(url);
    if (!kind) {
      skipped++;
      continue;
    }
    // Slack wants *bold*; Discord **bold**.
    const body = kind === "slack" ? { text: text.replace(/\*\*/g, "*") } : { content: text, allowed_mentions: { parse: [] } };
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (res?.ok) sent++;
    else skipped++;
  }
  return { sent, skipped };
}
