import { flagCode } from "@/lib/flags";

/** Country flag (flag-icons, MIT) with the IOC code as accessible text. Neutral athletes get no flag. */
export function Flag({ code, className = "" }: { code: string | null; className?: string }) {
  const iso = flagCode(code);
  if (!iso) return null;
  return <span aria-hidden className={`fi fi-${iso} shrink-0 rounded-[2px] ${className}`} />;
}
