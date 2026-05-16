// Central Unicode glyph palette. Every usage in the codebase must import from
// here so substitutions are greppable and inspectable.
export const glyphs = {
  checkMark: "✓",
  arrowUp: "↑",
  arrowDown: "↓",
  chevronRight: "›",
  userPromptCaret: "›",
  close: "×",
  statusDot: "●",
  snakeRectangle: "▰",
  snakeEllipse: "●",
  progressFill: "▓",
  progressEmpty: "░",
} as const;

export type GlyphName = keyof typeof glyphs;
