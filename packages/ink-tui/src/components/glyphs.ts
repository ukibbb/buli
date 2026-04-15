// Lucide icon names referenced in the pen design map to these Unicode
// glyphs. Every usage in the codebase must import from here so the
// substitutions are greppable and inspectable. See ink-limitations.md for
// the full mapping table.
export const glyphs = {
  checkMark: "✓",
  arrowUp: "↑",
  arrowDown: "↓",
  chevronRight: "›",
  close: "×",
  statusDot: "●",
  snakeRectangle: "▰",
  snakeEllipse: "●",
  progressFill: "▓",
  progressEmpty: "░",
} as const;

export type GlyphName = keyof typeof glyphs;
