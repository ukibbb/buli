// Palette sourced 1:1 from novibe.space/designs/my-design.pen.
// See terminal-rendering-limitations.md for the full mapping table and the rationale behind
// tokens whose pen-file equivalents do not translate to a terminal cell grid
// (sub-row stripes, font-size hierarchy, corner radius on fills).
//
// The terminal shell uses one black canvas across app chrome, cards, modals,
// callouts, and code blocks. Semantic states are carried by rails, borders,
// glyphs, and text colour rather than filled panel backgrounds.
export const chatScreenTheme = {
  bg: "#000000",
  surfaceOne: "#000000",
  surfaceTwo: "#000000",
  surfaceThree: "#000000",
  border: "#2A2A3A",
  borderSubtle: "#1E1E2E",
  textPrimary: "#FFFFFF",
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
  promptContextReferenceText: "#10B981",
  diffAdditionBg: "#000000",
  diffRemovalBg: "#000000",
  calloutInfoBg: "#000000",
  calloutSuccessBg: "#000000",
  calloutWarningBg: "#000000",
  calloutErrorBg: "#000000",
} as const;

export type ChatScreenTheme = typeof chatScreenTheme;
