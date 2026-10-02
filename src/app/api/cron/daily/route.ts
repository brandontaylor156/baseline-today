import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";

import { sendDigest } from "@/lib/digest";
import { provider } from "@/lib/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { TENNIS_TAG } from "@/lib/supabase/public";
import { runDailySync } from "@/lib/sync/daily";

export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Called by Vercel Cron once a day (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

  const result = await runDailySync(createAdminClient(), provider);
  console.log(`daily sync: ${JSON.stringify(result)}`);
  // Serve fresh rankings on the next visit instead of waiting out the hourly revalidation.
  if (result.status === "ok") revalidateTag(TENNIS_TAG, "max");
  // Daily digest to chat webhooks, if any are configured.
  const digest = await sendDigest().catch((err: Error) => `error: ${err.message}`);
  return Response.json({ ...result, digest }, { status: result.status === "error" ? 500 : 200 });
}
