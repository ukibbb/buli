export const HISTORICAL_TOOL_RESULT_TEXT_PER_OUTPUT_MAX_CHARACTER_COUNT = 8_192;
export const HISTORICAL_TOOL_TRANSCRIPT_TURN_MAX_CHARACTER_COUNT = 64 * 1024;

const HISTORICAL_TOOL_RESULT_TRUNCATION_SUBJECT = "tool result";
const HISTORICAL_TOOL_TRANSCRIPT_TRUNCATION_SUBJECT = "tool transcript";

type HistoricalToolContextTruncationSubject =
  | typeof HISTORICAL_TOOL_RESULT_TRUNCATION_SUBJECT
  | typeof HISTORICAL_TOOL_TRANSCRIPT_TRUNCATION_SUBJECT;

type HistoricalToolTextProjectionInput = Readonly<{
  text: string;
  maximumCharacterCount?: number | undefined;
}>;

type HistoricalToolTextProjectionRequest = Readonly<{
  text: string;
  maximumCharacterCount: number;
  truncationSubject: HistoricalToolContextTruncationSubject;
}>;

export function projectHistoricalToolResultTextForModelContext(
  input: HistoricalToolTextProjectionInput,
): string {
  return projectHistoricalToolTextForModelContext({
    text: input.text,
    maximumCharacterCount: normalizeHistoricalToolTextMaximumCharacterCount(
      input.maximumCharacterCount,
      HISTORICAL_TOOL_RESULT_TEXT_PER_OUTPUT_MAX_CHARACTER_COUNT,
    ),
    truncationSubject: HISTORICAL_TOOL_RESULT_TRUNCATION_SUBJECT,
  });
}

export function projectHistoricalToolTranscriptTextForModelContext(
  input: HistoricalToolTextProjectionInput,
): string {
  return projectHistoricalToolTextForModelContext({
    text: input.text,
    maximumCharacterCount: normalizeHistoricalToolTextMaximumCharacterCount(
      input.maximumCharacterCount,
      HISTORICAL_TOOL_TRANSCRIPT_TURN_MAX_CHARACTER_COUNT,
    ),
    truncationSubject: HISTORICAL_TOOL_TRANSCRIPT_TRUNCATION_SUBJECT,
  });
}

function normalizeHistoricalToolTextMaximumCharacterCount(
  requestedMaximumCharacterCount: number | undefined,
  defaultMaximumCharacterCount: number,
): number {
  if (requestedMaximumCharacterCount === undefined || !Number.isFinite(requestedMaximumCharacterCount)) {
    return defaultMaximumCharacterCount;
  }

  return Math.max(1, Math.floor(requestedMaximumCharacterCount));
}

function projectHistoricalToolTextForModelContext(input: HistoricalToolTextProjectionRequest): string {
  if (input.text.length <= input.maximumCharacterCount) {
    return input.text;
  }

  let retainedCharacterCount = input.maximumCharacterCount;
  while (retainedCharacterCount >= 0) {
    const omittedCharacterCount = input.text.length - retainedCharacterCount;
    const truncationNoticeText = createHistoricalToolContextTruncationNoticeText({
      truncationSubject: input.truncationSubject,
      omittedCharacterCount,
    });
    const nextRetainedCharacterCount = input.maximumCharacterCount - truncationNoticeText.length;

    if (nextRetainedCharacterCount < 0) {
      return truncationNoticeText.slice(0, input.maximumCharacterCount);
    }

    if (nextRetainedCharacterCount === retainedCharacterCount) {
      return input.text.slice(0, retainedCharacterCount) + truncationNoticeText;
    }

    retainedCharacterCount = nextRetainedCharacterCount;
  }

  return createHistoricalToolContextTruncationNoticeText({
    truncationSubject: input.truncationSubject,
    omittedCharacterCount: input.text.length,
  }).slice(0, input.maximumCharacterCount);
}

function createHistoricalToolContextTruncationNoticeText(input: Readonly<{
  truncationSubject: HistoricalToolContextTruncationSubject;
  omittedCharacterCount: number;
}>): string {
  return `\n\n[Historical ${input.truncationSubject} truncated for model context: omitted ${input.omittedCharacterCount} chars]`;
}
