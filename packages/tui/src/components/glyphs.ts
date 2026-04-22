// Lucide icon names referenced in the pen design map to these Unicode
// glyphs. Every usage in the codebase must import from here so the
// substitutions are greppable and inspectable. See terminal-rendering-limitations.md for
// the full mapping table.
//
// Tool-call glyphs (fileText / grepSearch / editPencil / bashTerminal /
// todoList / taskSpawn) substitute Lucide's file-text / search / pencil /
// terminal / list-checks / split-square glyphs. They keep the "one-cell
// monochrome symbol" aesthetic of the rest of the palette so the card
// headers read as a row of glyphs, not a mix of icon fonts and emoji.
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
  fileText: "≡",
  grepSearch: "⌕",
  editPencil: "✎",
  bashTerminal: ">_",
  todoList: "☐",
  taskSpawn: "◈",
} as const;

export type GlyphName = keyof typeof glyphs;
