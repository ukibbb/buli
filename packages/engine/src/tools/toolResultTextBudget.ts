type BudgetedTaggedToolResultTextInput = Readonly<{
  openingTag: string;
  closingTag: string;
  contentLines: readonly string[];
  maximumCharacterCount: number;
  truncationTagName: string;
  continuationGuidanceLines: readonly string[];
}>;

export function buildBudgetedTaggedToolResultText(input: BudgetedTaggedToolResultTextInput): string {
  const completeToolResultText = [input.openingTag, ...input.contentLines, input.closingTag].join("\n");
  if (completeToolResultText.length <= input.maximumCharacterCount) {
    return completeToolResultText;
  }

  const retainedContentLines: string[] = [];
  for (const contentLine of input.contentLines) {
    const candidateContentLines = [...retainedContentLines, contentLine];
    const omittedContentLines = input.contentLines.slice(candidateContentLines.length);
    const candidateToolResultText = buildTruncatedTaggedToolResultText({
      ...input,
      retainedContentLines: candidateContentLines,
      omittedLineCount: omittedContentLines.length,
      omittedCharacterCount: countJoinedLineCharacters(omittedContentLines),
    });

    if (candidateToolResultText.length > input.maximumCharacterCount) {
      break;
    }

    retainedContentLines.push(contentLine);
  }

  const omittedContentLines = input.contentLines.slice(retainedContentLines.length);
  return buildTruncatedTaggedToolResultText({
    ...input,
    retainedContentLines,
    omittedLineCount: omittedContentLines.length,
    omittedCharacterCount: countJoinedLineCharacters(omittedContentLines),
  });
}

function buildTruncatedTaggedToolResultText(input: BudgetedTaggedToolResultTextInput & Readonly<{
  retainedContentLines: readonly string[];
  omittedLineCount: number;
  omittedCharacterCount: number;
}>): string {
  return [
    input.openingTag,
    ...input.retainedContentLines,
    `<${input.truncationTagName}>`,
    `Output truncated to stay within ${input.maximumCharacterCount} characters.`,
    `Omitted approximately ${input.omittedCharacterCount} characters across ${input.omittedLineCount} lines.`,
    ...input.continuationGuidanceLines,
    `</${input.truncationTagName}>`,
    input.closingTag,
  ].join("\n");
}

function countJoinedLineCharacters(lines: readonly string[]): number {
  if (lines.length === 0) {
    return 0;
  }

  return lines.reduce((totalCharacterCount, line) => totalCharacterCount + line.length, 0) + lines.length - 1;
}
