export function normalizeVisibleReasoningSummaryText(reasoningSummaryText: string): string {
  return reasoningSummaryText.replaceAll("[REDACTED]", "").trim();
}

export function hasVisibleReasoningSummaryText(reasoningSummaryText: string): boolean {
  return normalizeVisibleReasoningSummaryText(reasoningSummaryText).length > 0;
}

export function readReasoningSummaryTitle(visibleReasoningSummaryText: string): string | undefined {
  const titleMatch = visibleReasoningSummaryText.trimStart().match(/^\*\*([^*\n]+)\*\*/);
  const titleText = titleMatch?.[1]?.trim();
  return titleText && titleText.length > 0 ? titleText : undefined;
}
