import type { MarkdownOptions } from "@opentui/core";

export const defaultAssistantMarkdownTerminalColumnCount = 80;

export const assistantMarkdownTableOptions = {
  style: "grid",
} satisfies NonNullable<MarkdownOptions["tableOptions"]>;
