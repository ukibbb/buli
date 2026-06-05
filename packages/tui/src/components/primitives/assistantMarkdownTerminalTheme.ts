import { RGBA, SyntaxStyle, type MarkdownOptions } from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import {
  assistantMarkdownUnorderedListMarkers,
  type AssistantMarkdownCalloutKind,
} from "./assistantMarkdownRenderSectionTypes.ts";

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

export const assistantMarkdownQuoteSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex(chatScreenTheme.textSecondary), italic: true },
});

export const assistantMarkdownTaskListSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  checked: { fg: RGBA.fromHex(chatScreenTheme.accentGreen), bold: true },
  unchecked: { fg: RGBA.fromHex(chatScreenTheme.textDim), bold: true },
});

export const assistantMarkdownCalloutSyntaxStyleByKind: Record<AssistantMarkdownCalloutKind, SyntaxStyle> = {
  NOTE: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentCyan), bold: true } }),
  TIP: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentGreen), bold: true } }),
  IMPORTANT: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true } }),
  WARNING: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true } }),
  CAUTION: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentRed), bold: true } }),
};

export function resolveAssistantMarkdownHeadingSyntaxStyle(headingDepth: number): SyntaxStyle {
  if (headingDepth === 1) return assistantMarkdownHeadingSyntaxStyleByDepth[1];
  if (headingDepth === 2) return assistantMarkdownHeadingSyntaxStyleByDepth[2];
  if (headingDepth === 3) return assistantMarkdownHeadingSyntaxStyleByDepth[3];
  return assistantMarkdownHeadingSyntaxStyleByDepth.fallback;
}

export function resolveAssistantMarkdownHeadingForegroundColor(headingDepth: number): string {
  if (headingDepth === 1) return chatScreenTheme.accentCyan;
  if (headingDepth === 2) return chatScreenTheme.accentAmber;
  if (headingDepth === 3) return chatScreenTheme.accentPurple;
  return chatScreenTheme.textPrimary;
}

export function formatAssistantMarkdownVisibleHeadingText(input: { headingDepth: number; headingText: string }): string {
  if (input.headingDepth === 1) {
    return `▌ ${input.headingText}`;
  }
  if (input.headingDepth === 2) {
    return `◆ ${input.headingText}`;
  }
  if (input.headingDepth === 3) {
    return input.headingText;
  }
  return `• ${input.headingText}`;
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
