import { oddsText, rankingsText, resultsText } from "@/lib/bot";
import { isTour } from "@/lib/format";

export const maxDuration = 10;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Discord signs every interaction with Ed25519; anything unsigned or forged is refused. */
async function verified(request: Request, body: string): Promise<boolean> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!publicKey || !signature || !timestamp || !/^[0-9a-f]{128}$/i.test(signature) || !/^[0-9a-f]{64}$/i.test(publicKey)) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(signature), new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}

type Option = { name: string; value: string };

// Discord interactions endpoint: /odds, /rankings and /results (off until DISCORD_PUBLIC_KEY is set).
export async function POST(request: Request) {
  if (!process.env.DISCORD_PUBLIC_KEY) return new Response("Not found", { status: 404 });
  const body = await request.text();
  if (!(await verified(request, body))) return new Response("Invalid signature", { status: 401 });

  const interaction = JSON.parse(body) as { type: number; data?: { name: string; options?: Option[] } };
  if (interaction.type === 1) return Response.json({ type: 1 }); // PING

  const option = (name: string) => interaction.data?.options?.find((o) => o.name === name)?.value ?? "";
  let content = "Unknown command.";
  switch (interaction.data?.name) {
    case "odds":
      content = await oddsText(option("player1"), option("player2"));
      break;
    case "rankings": {
      const tour = option("tour").toLowerCase();
      content = isTour(tour) ? await rankingsText(tour) : "Use atp or wta.";
      break;
    }
    case "results":
      content = await resultsText();
      break;
  }
  // Type 4: reply in the channel; no pings.
  return Response.json({ type: 4, data: { content, allowed_mentions: { parse: [] } } });
}
