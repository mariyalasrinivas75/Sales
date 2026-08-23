// Shared color tokens — enterprise blue, not indigo/violet (avoids "AI gradient" look).
// Dark slate surfaces kept as-is; only the accent hue changed.
export const colors = {
  background: "#0f172a",
  surface: "rgba(30, 41, 59, 0.7)",
  surfaceSolid: "#1e293b",
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.1)",
  textPrimary: "#f1f5f9",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accent: "#0369a1",
  accentLight: "#38bdf8",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#dc2626",
} as const;
