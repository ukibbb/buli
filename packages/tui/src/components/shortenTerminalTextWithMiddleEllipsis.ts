const terminalEllipsis = "…";

export function shortenTerminalTextWithMiddleEllipsis(
  inputText: string,
  maximumVisibleCharacterCount: number,
): string {
  if (maximumVisibleCharacterCount <= 0) {
    return "";
  }

  if (inputText.length <= maximumVisibleCharacterCount) {
    return inputText;
  }

  if (maximumVisibleCharacterCount === 1) {
    return terminalEllipsis;
  }

  const visibleCharacterCountAroundEllipsis = maximumVisibleCharacterCount - terminalEllipsis.length;
  const leadingCharacterCount = Math.ceil(visibleCharacterCountAroundEllipsis / 2);
  const trailingCharacterCount = Math.floor(visibleCharacterCountAroundEllipsis / 2);
  const trailingText = trailingCharacterCount > 0 ? inputText.slice(-trailingCharacterCount) : "";

  return `${inputText.slice(0, leadingCharacterCount)}${terminalEllipsis}${trailingText}`;
}
