// Palette sourced 1:1 from novibe.space/designs/my-design.pen.
// See ink-limitations.md for the full mapping table and the rationale behind
// tokens whose pen-file equivalents do not translate to a terminal cell grid
// (sub-row stripes, font-size hierarchy, corner radius on fills).
export const chatScreenTheme = {
  bg: "#0A0A0F",
  surfaceOne: "#111118",
  surfaceTwo: "#16161F",
  surfaceThree: "#1C1C28",
  border: "#2A2A3A",
  borderSubtle: "#1E1E2E",
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  textDim: "#475569",
  accentGreen: "#10B981",
  accentAmber: "#F59E0B",
  accentCyan: "#22D3EE",
  accentRed: "#EF4444",
  accentPrimary: "#6366F1",
  accentPrimaryMuted: "#818CF8",
  accentPurple: "#A855F7",
} as const;
