import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { PuzzleGame } from "@/components/puzzle-game";
import { UpsetCallGame } from "@/components/upset-call";
import { getUpsetCall } from "@/lib/data/upset-call";
import { puzzleNumber, tourForDay } from "@/lib/puzzle";

export const metadata: Metadata = {
  title: "Daily tennis games",
  description: "Guess the tennis player in six tries, and call the upset of the day against our model. A new puzzle every day.",
};

export default async function PlayPage() {
  await connection();
  const day = new Date().toISOString().slice(0, 10);
  const call = await getUpsetCall(day).catch(() => null);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Play</h1>
        <p className="text-sm text-muted">
          Two quick games, new every day. Also: <Link href="/pickem" className="underline underline-offset-2">Pick’em</Link>,{" "}
          <Link href="/leagues" className="underline underline-offset-2">leagues</Link> and{" "}
          <Link href="/party/demo" className="underline underline-offset-2">watch parties</Link>.
        </p>
      </div>
      <section aria-labelledby="puzzle-heading" className="space-y-3">
        <h2 id="puzzle-heading" className="text-lg font-semibold">
          Guess the player #{puzzleNumber(day)}
        </h2>
        <PuzzleGame day={day} number={puzzleNumber(day)} tour={tourForDay(day)} />
      </section>
      {call ? (
        <UpsetCallGame call={call} />
      ) : (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">No upset of the day today: no upcoming match fits. Back tomorrow.</p>
      )}
    </div>
  );
}
