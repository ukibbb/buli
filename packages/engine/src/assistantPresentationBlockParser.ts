import {
  formatLearningSequenceAsMarkdownText,
  LearningSequenceSchema,
  type LearningSequence,
} from "@buli/contracts";

export type AssistantPresentationStreamSegment =
  | {
      segmentKind: "plain_text";
      text: string;
    }
  | {
      segmentKind: "learning_sequence";
      learningSequence: LearningSequence;
      fallbackMarkdownText: string;
    };

const learningSequenceFenceStartPattern = /(?:^|\n)```buli\.learning_sequence[^\S\r\n]*\r?\n/;
const learningSequenceStartMarker = "```buli.learning_sequence";

export class AssistantPresentationBlockStreamParser {
  private unprocessedAssistantText = "";

  appendAssistantText(assistantText: string): AssistantPresentationStreamSegment[] {
    this.unprocessedAssistantText += assistantText;
    return this.drainAssistantTextSegments({ isFinal: false });
  }

  flushPendingAssistantText(): AssistantPresentationStreamSegment[] {
    return this.drainAssistantTextSegments({ isFinal: true });
  }

  private drainAssistantTextSegments(input: { isFinal: boolean }): AssistantPresentationStreamSegment[] {
    const assistantPresentationStreamSegments: AssistantPresentationStreamSegment[] = [];

    while (this.unprocessedAssistantText.length > 0) {
      const learningSequenceFenceStart = findLearningSequenceFenceStart(this.unprocessedAssistantText);
      if (!learningSequenceFenceStart) {
        const plainTextCutoff = input.isFinal
          ? this.unprocessedAssistantText.length
          : findPlainTextCutoffBeforePossibleLearningSequenceFence(this.unprocessedAssistantText);
        if (plainTextCutoff === 0) {
          break;
        }

        assistantPresentationStreamSegments.push({
          segmentKind: "plain_text",
          text: this.unprocessedAssistantText.slice(0, plainTextCutoff),
        });
        this.unprocessedAssistantText = this.unprocessedAssistantText.slice(plainTextCutoff);
        continue;
      }

      if (learningSequenceFenceStart.startIndex > 0) {
        assistantPresentationStreamSegments.push({
          segmentKind: "plain_text",
          text: this.unprocessedAssistantText.slice(0, learningSequenceFenceStart.startIndex),
        });
        this.unprocessedAssistantText = this.unprocessedAssistantText.slice(learningSequenceFenceStart.startIndex);
        continue;
      }

      const learningSequenceFenceEnd = findClosingFenceEnd(this.unprocessedAssistantText, learningSequenceFenceStart.contentStartIndex);
      if (!learningSequenceFenceEnd) {
        if (!input.isFinal) {
          break;
        }

        assistantPresentationStreamSegments.push({
          segmentKind: "plain_text",
          text: this.unprocessedAssistantText,
        });
        this.unprocessedAssistantText = "";
        break;
      }

      const rawLearningSequenceBlockText = this.unprocessedAssistantText.slice(0, learningSequenceFenceEnd.closeEndIndex);
      const learningSequenceBlockContentText = this.unprocessedAssistantText.slice(
        learningSequenceFenceStart.contentStartIndex,
        learningSequenceFenceEnd.contentEndIndex,
      );
      const learningSequence = parseLearningSequenceBlockContent(learningSequenceBlockContentText);
      assistantPresentationStreamSegments.push(
        learningSequence
          ? {
              segmentKind: "learning_sequence",
              learningSequence,
              fallbackMarkdownText: formatLearningSequenceAsMarkdownText(learningSequence),
            }
          : {
              segmentKind: "plain_text",
              text: rawLearningSequenceBlockText,
            },
      );
      this.unprocessedAssistantText = this.unprocessedAssistantText.slice(learningSequenceFenceEnd.closeEndIndex);
    }

    return assistantPresentationStreamSegments;
  }
}

function findLearningSequenceFenceStart(inputText: string): { startIndex: number; contentStartIndex: number } | undefined {
  const learningSequenceFenceStartMatch = learningSequenceFenceStartPattern.exec(inputText);
  if (!learningSequenceFenceStartMatch) {
    return undefined;
  }

  const startIndex = inputText[learningSequenceFenceStartMatch.index] === "\n"
    ? learningSequenceFenceStartMatch.index + 1
    : learningSequenceFenceStartMatch.index;
  return {
    startIndex,
    contentStartIndex: learningSequenceFenceStartMatch.index + learningSequenceFenceStartMatch[0].length,
  };
}

function findPlainTextCutoffBeforePossibleLearningSequenceFence(inputText: string): number {
  for (let suffixStartIndex = inputText.length - 1; suffixStartIndex >= Math.max(0, inputText.length - learningSequenceStartMarker.length - 1); suffixStartIndex -= 1) {
    const suffixText = inputText.slice(suffixStartIndex);
    if (isPossibleLearningSequenceFenceStartSuffix(suffixText)) {
      return suffixStartIndex;
    }
  }

  return inputText.length;
}

function isPossibleLearningSequenceFenceStartSuffix(suffixText: string): boolean {
  if (learningSequenceStartMarker.startsWith(suffixText) || (`\n${learningSequenceStartMarker}`).startsWith(suffixText)) {
    return true;
  }

  const suffixTextWithoutLeadingNewline = suffixText.startsWith("\n") ? suffixText.slice(1) : suffixText;
  return suffixTextWithoutLeadingNewline.startsWith(learningSequenceStartMarker) &&
    /^[^\S\r\n]*$/.test(suffixTextWithoutLeadingNewline.slice(learningSequenceStartMarker.length));
}

function findClosingFenceEnd(inputText: string, contentStartIndex: number): { contentEndIndex: number; closeEndIndex: number } | undefined {
  const closingFencePattern = /(^|\n)```[^\S\r\n]*\r?(?:\n|$)/g;
  closingFencePattern.lastIndex = contentStartIndex;
  const closingFenceMatch = closingFencePattern.exec(inputText);
  if (!closingFenceMatch) {
    return undefined;
  }

  return {
    contentEndIndex: closingFenceMatch.index,
    closeEndIndex: closingFenceMatch.index + closingFenceMatch[0].length,
  };
}

function parseLearningSequenceBlockContent(blockContentText: string): LearningSequence | undefined {
  let parsedBlockContent: unknown;
  try {
    parsedBlockContent = JSON.parse(blockContentText.trim()) as unknown;
  } catch {
    return undefined;
  }

  const learningSequence = LearningSequenceSchema.safeParse(parsedBlockContent);
  return learningSequence.success ? learningSequence.data : undefined;
}
