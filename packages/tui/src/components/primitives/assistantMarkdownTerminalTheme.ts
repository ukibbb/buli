import { RGBA, SyntaxStyle, type MarkdownOptions } from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { assistantMarkdownUnorderedListMarkers } from "./assistantMarkdownRenderSectionTypes.ts";

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

const assistantMarkdownHeadingSyntaxStyleByDepth = {
  1: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentCyan), bold: true } }),
  2: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true } }),
  3: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true } }),
  fallback: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.textPrimary), bold: true } }),
} as const;

export function resolveAssistantMarkdownHeadingSyntaxStyle(headingDepth: number): SyntaxStyle {
  if (headingDepth === 1) return assistantMarkdownHeadingSyntaxStyleByDepth[1];
  if (headingDepth === 2) return assistantMarkdownHeadingSyntaxStyleByDepth[2];
  if (headingDepth === 3) return assistantMarkdownHeadingSyntaxStyleByDepth[3];
  return assistantMarkdownHeadingSyntaxStyleByDepth.fallback;
}

export function resolveAssistantMarkdownVisibleListMarkerColor(listItemMarkerText: string): string {
  const trimmedListItemMarkerText = listItemMarkerText.trim();
  if (trimmedListItemMarkerText === "☑") {
    return chatScreenTheme.accentGreen;
  }
  if (trimmedListItemMarkerText === "☐") {
    return chatScreenTheme.textDim;
  }
  if (/^\d+\.$/.test(trimmedListItemMarkerText)) {
    return chatScreenTheme.accentAmber;
  }

  const unorderedListMarkerIndex = assistantMarkdownUnorderedListMarkers.indexOf(
    trimmedListItemMarkerText as (typeof assistantMarkdownUnorderedListMarkers)[number],
  );
  return [
    chatScreenTheme.accentPrimaryMuted,
    chatScreenTheme.accentCyan,
    chatScreenTheme.accentAmber,
    chatScreenTheme.accentPurple,
  ][unorderedListMarkerIndex] ?? chatScreenTheme.textMuted;
}
