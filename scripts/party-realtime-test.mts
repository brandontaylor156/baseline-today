// End-to-end check of watch-party realtime with throwaway accounts (deleted at the end):
// host + guest exchange chat and score over the private channel; an outsider must hear nothing.
//   npx tsx --env-file=.env.local scripts/party-realtime-test.mts <scheduled match id>
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const matchId = Number(process.argv[2]);
const created: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function signedIn(label: string): Promise<SupabaseClient> {
  const email = `party-${label}-${Date.now()}@test.invalid`;
  const { data: u, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(`create ${label}: ${error.message}`);
  created.push(u.user.id);
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (lErr) throw new Error(`link ${label}: ${lErr.message}`);
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: vErr } = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (vErr) throw new Error(`sign in ${label}: ${vErr.message}`);
  return client;
}

function listen(client: SupabaseClient, partyId: string, got: string[], label: string) {
  return new Promise<string>((resolve) => {
    const ch = client.channel(`party:${partyId}`, { config: { private: true } });
    ch.on("broadcast", { event: "chat" }, ({ payload }) => got.push(`${label} got ${(payload as { text: string }).text}`));
    void client.realtime.setAuth().then(() => ch.subscribe((status, err) => (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? resolve(`${label}: ${status}${err ? ` (${err.message})` : ""}`) : undefined)));
  });
}

const results: string[] = [];
try {
  const [host, guest, outsider] = await Promise.all([signedIn("host"), signedIn("guest"), signedIn("outsider")]);
  const { data: code, error: cErr } = await host.rpc("create_party", { p_match_id: matchId, p_nickname: "HostTest" });
  if (cErr) throw new Error(`create_party: ${cErr.message}`);
  const { data: partyId, error: jErr } = await guest.rpc("join_party", { p_code: code, p_nickname: "GuestTest" });
  if (jErr) throw new Error(`join_party: ${jErr.message}`);

  const got: string[] = [];
  results.push(await listen(guest, partyId, got, "guest"));
  results.push(await listen(outsider, partyId, got, "outsider"));
  const hostCh = host.channel(`party:${partyId}`, { config: { private: true } });
  await host.realtime.setAuth();
  results.push(await new Promise<string>((r) => hostCh.subscribe((s) => (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" ? r(`host: ${s}`) : undefined))));
  await sleep(800);
  const sent = await hostCh.send({ type: "broadcast", event: "chat", payload: { text: "hello from host" } });
  results.push(`host send: ${sent}`);
  await sleep(2500);
  results.push(...(got.length ? got : ["nobody received"]));

  const { error: sErr } = await host.from("parties").update({ state: { points: [1, 1], firstServerA: true, bestOf: 3 } }).eq("id", partyId);
  const { data: seen } = await guest.from("parties").select("state").eq("id", partyId).maybeSingle();
  results.push(`score saved: ${!sErr}, guest sees ${JSON.stringify((seen?.state as { points?: number[] })?.points)}`);
  const { data: peek } = await outsider.from("parties").select("id").eq("id", partyId);
  results.push(`outsider sees party rows: ${peek?.length ?? 0}`);

  await host.from("parties").delete().eq("id", partyId);
  for (const c of [host, guest, outsider]) await c.removeAllChannels();
} catch (err) {
  results.push(`ERROR ${err instanceof Error ? err.message : err}`);
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id);
  results.push(`deleted ${created.length} test users`);
}
console.log(results.join("\n"));
process.exit(0);
