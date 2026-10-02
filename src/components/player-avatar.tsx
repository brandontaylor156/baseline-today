import type { PlayerImage } from "@/lib/data/tennis";
import { initials } from "@/lib/format";

const SIZES = {
  sm: "size-8 text-xs",
  lg: "size-28 text-3xl sm:size-36 sm:text-4xl",
} as const;

/** Credited photo when we have one, otherwise an initials avatar. */
export function PlayerAvatar({
  name,
  image,
  size = "sm",
}: {
  name: string;
  image: PlayerImage | null;
  size?: keyof typeof SIZES;
}) {
  if (image) {
    return (
      // Wikimedia serves pre-sized thumbnails; next/image would only add a second resize.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image.imageUrl}
        alt={size === "lg" ? name : ""}
        loading={size === "lg" ? "eager" : "lazy"}
        className={`${SIZES[size]} shrink-0 rounded-full object-cover object-top bg-surface-muted`}
      />
    );
  }
  return (
    <span
      aria-hidden={size !== "lg"}
      role={size === "lg" ? "img" : undefined}
      aria-label={size === "lg" ? name : undefined}
      className={`${SIZES[size]} inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent`}
    >
      {initials(name)}
    </span>
  );
}
