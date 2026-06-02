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

export type ProviderVisibleToolResultBudgetGateInput = Readonly<{
  toolName: string;
  sourceText: string;
  maximumCharacterCount: number;
  metadataLines: readonly string[];
  guidanceLines: readonly string[];
  rawEvidenceStorage: "canonical_tool_result_text_stored" | "external_output_capture_may_be_truncated";
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

export function buildProviderVisibleToolResultBudgetGateText(
  input: ProviderVisibleToolResultBudgetGateInput,
): string {
  const maximumCharacterCount = Math.max(0, Math.floor(input.maximumCharacterCount));
  if (input.sourceText.length <= maximumCharacterCount) {
    return input.sourceText;
  }

  const budgetGateText = [
    `<tool_result_budget_gate tool="${escapeXmlAttribute(input.toolName)}">`,
    "<status>too_broad_incomplete</status>",
    `<original_character_count>${input.sourceText.length}</original_character_count>`,
    `<provider_visible_character_limit>${maximumCharacterCount}</provider_visible_character_limit>`,
    `<raw_evidence_storage>${input.rawEvidenceStorage}</raw_evidence_storage>`,
    "<reason>The requested tool output is too large to send as first-time provider-visible evidence without risking misleading partial evidence.</reason>",
    "<safe_reasoning_rule>Do not make absence, completeness, or coverage claims from this gated result. The raw output text is intentionally not included here.</safe_reasoning_rule>",
    "<metadata>",
    ...input.metadataLines.map((metadataLine) => `- ${metadataLine}`),
    "</metadata>",
    "<required_next_actions>",
    "- Treat this as incomplete evidence, not as a truncated sample.",
    ...input.guidanceLines.map((guidanceLine) => `- ${guidanceLine}`),
    "</required_next_actions>",
    "</tool_result_budget_gate>",
  ].join("\n");

  if (budgetGateText.length <= maximumCharacterCount) {
    return budgetGateText;
  }

  return buildMinimalProviderVisibleToolResultBudgetGateText({
    ...input,
    maximumCharacterCount,
  });
}

function buildMinimalProviderVisibleToolResultBudgetGateText(
  input: ProviderVisibleToolResultBudgetGateInput,
): string {
  const minimalBudgetGateText = [
    `<tool_result_budget_gate tool="${escapeXmlAttribute(input.toolName)}">`,
    "<status>too_broad_incomplete</status>",
    `<original_character_count>${input.sourceText.length}</original_character_count>`,
    `<provider_visible_character_limit>${input.maximumCharacterCount}</provider_visible_character_limit>`,
    `<raw_evidence_storage>${input.rawEvidenceStorage}</raw_evidence_storage>`,
    "<safe_reasoning_rule>Do not use this gated result for absence or completeness claims. Request narrower or batched follow-up tool calls.</safe_reasoning_rule>",
    "</tool_result_budget_gate>",
  ].join("\n");

  if (minimalBudgetGateText.length <= input.maximumCharacterCount) {
    return minimalBudgetGateText;
  }

  return minimalBudgetGateText.slice(0, input.maximumCharacterCount);
}

function escapeXmlAttribute(attributeText: string): string {
  return attributeText
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
