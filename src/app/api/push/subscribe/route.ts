import { pushConfig } from "@/lib/push/config";
import { createClient } from "@/lib/supabase/server";

const noStore = { "Cache-Control": "no-store" };

type Body = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

async function readBody(request: Request): Promise<Body | null> {
  try {
    return (await request.json()) as Body;
  } catch {
    return null;
  }
}

// Saves this browser's push subscription for the signed-in user (their own session; RLS applies).
export async function POST(request: Request) {
  if (!pushConfig()) return Response.json({ error: "Notifications are off" }, { status: 404, headers: noStore });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) return Response.json({ error: "Sign in first" }, { status: 401, headers: noStore });

  const body = await readBody(request);
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const key = body?.keys?.auth;
  if (!isText(endpoint, 1000) || !endpoint.startsWith("https://") || !isText(p256dh, 200) || !isText(key, 100)) {
    return Response.json({ error: "Bad subscription" }, { status: 400, headers: noStore });
  }

  const { error } = await supabase.rpc("save_push_subscription", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: key });
  if (error) return Response.json({ error: "Could not save" }, { status: 500, headers: noStore });
  return Response.json({ ok: true }, { headers: noStore });
}

// Removes this browser's subscription; RLS only lets users delete their own.
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) return Response.json({ error: "Sign in first" }, { status: 401, headers: noStore });
  const endpoint = (await readBody(request))?.endpoint;
  if (!isText(endpoint, 1000)) return Response.json({ error: "Bad subscription" }, { status: 400, headers: noStore });

  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return Response.json({ error: "Could not remove" }, { status: 500, headers: noStore });
  return Response.json({ ok: true }, { headers: noStore });
}
