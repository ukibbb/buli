import type { MarkdownOptions } from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export const defaultAssistantMarkdownTerminalColumnCount = 80;

export const assistantMarkdownTableOptions = {
  borders: true,
  borderColor: chatScreenTheme.borderSubtle,
  borderStyle: "single",
  cellPadding: 0,
  columnFitter: "balanced",
  outerBorder: true,
  selectable: true,
  style: "grid",
  widthMode: "content",
  wrapMode: "word",
} satisfies NonNullable<MarkdownOptions["tableOptions"]>;
