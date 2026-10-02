import { describeMovement } from "@/lib/format";

const COLOR = { up: "text-up", down: "text-down", none: "text-muted" } as const;

export function Movement({ value }: { value: number | null }) {
  const m = describeMovement(value);
  return (
    <span className={`text-xs tabular-nums ${COLOR[m.direction]}`}>
      <span aria-hidden>{m.short}</span>
      <span className="sr-only">{m.label}</span>
    </span>
  );
}
