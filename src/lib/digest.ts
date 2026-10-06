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

function webhookUrls(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Posts a message to each chat webhook; URLs that aren't Discord or Slack webhooks are skipped. */
async function postToWebhooks(urls: string[], text: string): Promise<{ sent: number; skipped: number }> {
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

/** Posts the daily digest to every webhook in DIGEST_WEBHOOK_URLS (comma-separated). */
export async function sendDigest(): Promise<{ sent: number; skipped: number } | null> {
  const urls = webhookUrls(process.env.DIGEST_WEBHOOK_URLS);
  if (urls.length === 0) return null;
  return postToWebhooks(urls, await digestText());
}

/** Job failure alerts: OPS_WEBHOOK_URLS, or the digest webhooks when that isn't set. No-op without either. */
export async function sendAlert(text: string): Promise<void> {
  const urls = webhookUrls(process.env.OPS_WEBHOOK_URLS || process.env.DIGEST_WEBHOOK_URLS);
  if (urls.length > 0) await postToWebhooks(urls, text).catch(() => undefined);
}
