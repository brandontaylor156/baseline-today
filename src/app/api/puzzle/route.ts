import { getGuessPlayer, getPuzzleAnswer, validDay } from "@/lib/data/puzzle";
import { compare, puzzleNumber, tourForDay } from "@/lib/puzzle";

const noStore = { headers: { "Cache-Control": "no-store" } };

// GET /api/puzzle?day=YYYY-MM-DD           → the day's puzzle (number and tour; never the answer)
// GET /api/puzzle?day=…&reveal=1           → the answer (after the last guess or giving up)
// POST /api/puzzle {day, playerId}         → how that guess compares with the answer
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const day = params.get("day") ?? new Date().toISOString().slice(0, 10);
  if (!validDay(day)) return Response.json({ error: "No puzzle for that day" }, { status: 404, ...noStore });
  if (params.get("reveal") === "1") {
    const answer = await getPuzzleAnswer(day);
    return answer ? Response.json({ answer }, noStore) : Response.json({ error: "No puzzle" }, { status: 404, ...noStore });
  }
  return Response.json({ day, number: puzzleNumber(day), tour: tourForDay(day) }, noStore);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { day?: unknown; playerId?: unknown } | null;
  const day = typeof body?.day === "string" ? body.day : null;
  const id = typeof body?.playerId === "number" && Number.isInteger(body.playerId) && body.playerId > 0 ? body.playerId : null;
  if (!validDay(day) || id === null) return Response.json({ error: "Pass day and playerId" }, { status: 400, ...noStore });
  const [answer, guess] = await Promise.all([getPuzzleAnswer(day), getGuessPlayer(id, day)]);
  if (!answer || !guess) return Response.json({ error: "Unknown player" }, { status: 404, ...noStore });
  const feedback = compare(guess, answer);
  return Response.json({ feedback, ...(feedback.correct ? { answer } : {}) }, noStore);
}
