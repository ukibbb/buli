type BudgetedTaggedToolResultTextInput = Readonly<{
  openingTag: string;
  closingTag: string;
  contentLines: readonly string[];
  maximumCharacterCount: number;
  truncationTagName: string;
  continuationGuidanceLines: readonly string[];
}>;

type HeadTailBudgetedTextInput = Readonly<{
  sourceText: string;
  maximumCharacterCount: number;
  createTruncationNotice: (omittedCharacterCount: number) => string;
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

export function buildHeadTailBudgetedText(input: HeadTailBudgetedTextInput): string {
  const maximumCharacterCount = Math.max(0, Math.floor(input.maximumCharacterCount));
  if (input.sourceText.length <= maximumCharacterCount) {
    return input.sourceText;
  }

  let truncationNotice = input.createTruncationNotice(input.sourceText.length);
  for (let attemptIndex = 0; attemptIndex < 10; attemptIndex += 1) {
    const retainedCharacterCount = maximumCharacterCount - truncationNotice.length;
    if (retainedCharacterCount <= 0) {
      return truncationNotice.slice(0, maximumCharacterCount);
    }

    const retainedHeadCharacterCount = Math.ceil(retainedCharacterCount / 2);
    const retainedTailCharacterCount = Math.floor(retainedCharacterCount / 2);
    const omittedCharacterCount = input.sourceText.length - retainedHeadCharacterCount - retainedTailCharacterCount;
    const nextTruncationNotice = input.createTruncationNotice(omittedCharacterCount);
    if (nextTruncationNotice.length === truncationNotice.length || attemptIndex === 9) {
      return [
        input.sourceText.slice(0, retainedHeadCharacterCount),
        nextTruncationNotice,
        retainedTailCharacterCount > 0 ? input.sourceText.slice(-retainedTailCharacterCount) : "",
      ].join("");
    }

    truncationNotice = nextTruncationNotice;
  }

  return input.sourceText.slice(0, maximumCharacterCount);
}
