// Shared layout for share-card images (rendered by next/og: flexbox only, inline styles).

export const OG_SIZE = { width: 1200, height: 630 };

const BG = "#0d1110";
const SURFACE = "#151a18";
const TEXT = "#e8ece9";
const MUTED = "#93a09a";
const ACCENT = "#5fd08f";

export function OgFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: BG,
        color: TEXT,
        padding: "56px 64px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 700 }}>
        <div style={{ width: 22, height: 22, borderRadius: 11, background: ACCENT }} />
        Baseline Today
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center" }}>{children}</div>
    </div>
  );
}

export function OgStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", background: SURFACE, borderRadius: 20, padding: "18px 26px", minWidth: 190 }}>
      <div style={{ fontSize: 24, color: MUTED }}>{label}</div>
      <div style={{ fontSize: 52, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export const OG_COLORS = { BG, SURFACE, TEXT, MUTED, ACCENT };
