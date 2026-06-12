import { createHash } from "node:crypto";
import type { OpenAiWorkingSetInputItemProjectionMetadata } from "./openAiWorkingSetVisibilityDiagnostics.ts";
import type { OpenAiConversationInputItem, OpenAiFunctionCallOutputInputItem } from "./request.ts";

export const OPENAI_CURRENT_TURN_DUPLICATE_TOOL_RESULT_REFERENCE_MIN_CHARACTER_COUNT = 8_192;

export const OPENAI_CROSS_STEP_TOOL_RESULT_REFERENCES_ENV_VAR = "BULI_OPENAI_CROSS_STEP_TOOL_RESULT_REFERENCES";

/** Results first sent in the immediately preceding request stay exact; only older same-turn replay may be referenced. */
export const OPENAI_CROSS_STEP_TOOL_RESULT_REFERENCE_MIN_REQUEST_AGE = 2;

const CROSS_STEP_REFERENCE_EXCERPT_CHARACTER_COUNT = 200;

export type OpenAiCrossStepToolResultReplayReferenceInput = Readonly<{
  /** 0-based index of the request currently being built within this provider turn. */
  currentRequestIndex: number;
  /** Input item count included in each previously built request of this turn, in build order. */
  inputItemCountByBuiltRequestIndex: readonly number[];
}>;

export type OpenAiCurrentTurnToolResultReplayProjectionDiagnostics = Readonly<{
  requestCurrentTurnFunctionCallOutputOriginalTextLength: number;
  requestCurrentTurnFunctionCallOutputProjectedTextLength: number;
  requestCurrentTurnFunctionCallOutputSavedCharacterCount: number;
  requestCurrentTurnCompactedFunctionCallOutputCount: number;
  requestCurrentTurnExactWorkingSetFunctionCallOutputCount: number;
  requestCurrentTurnExactWorkingSetFunctionCallOutputTextLength: number;
}>;

export type OpenAiCurrentTurnToolResultReplayProjection = Readonly<{
  projectedOpenAiInputItems: readonly OpenAiConversationInputItem[];
  projectionMetadataByInputItemIndex: ReadonlyMap<number, OpenAiWorkingSetInputItemProjectionMetadata>;
  diagnostics: OpenAiCurrentTurnToolResultReplayProjectionDiagnostics;
}>;

type FirstVisibleExactCurrentTurnToolResultOutput = Readonly<{
  inputItemIndex: number;
  toolCallId: string;
  evidenceId: string;
  contentSha256: string;
}>;

const textEncoder = new TextEncoder();

export function projectCurrentTurnToolResultReplayForOpenAiRequest(input: {
  openAiInputItems: readonly OpenAiConversationInputItem[];
  currentTurnFirstInputItemIndex: number;
  duplicateReferenceMinimumCharacterCount?: number | undefined;
  crossStepReference?: OpenAiCrossStepToolResultReplayReferenceInput | undefined;
}): OpenAiCurrentTurnToolResultReplayProjection {
  const duplicateReferenceMinimumCharacterCount = input.duplicateReferenceMinimumCharacterCount ??
    OPENAI_CURRENT_TURN_DUPLICATE_TOOL_RESULT_REFERENCE_MIN_CHARACTER_COUNT;
  const projectedOpenAiInputItems = [...input.openAiInputItems];
  const projectionMetadataByInputItemIndex = new Map<number, OpenAiWorkingSetInputItemProjectionMetadata>();
  const firstExactCurrentTurnToolResultByOutputText = new Map<string, FirstVisibleExactCurrentTurnToolResultOutput>();
  let currentTurnFunctionCallOutputOriginalTextLength = 0;
  let currentTurnFunctionCallOutputProjectedTextLength = 0;
  let compactedCurrentTurnFunctionCallOutputCount = 0;
  let exactCurrentTurnFunctionCallOutputCount = 0;
  let exactCurrentTurnFunctionCallOutputTextLength = 0;

  for (
    let inputItemIndex = Math.max(0, input.currentTurnFirstInputItemIndex);
    inputItemIndex < input.openAiInputItems.length;
    inputItemIndex += 1
  ) {
    const openAiInputItem = input.openAiInputItems[inputItemIndex];
    if (!openAiInputItem || !isOpenAiFunctionCallOutputInputItem(openAiInputItem)) {
      continue;
    }

    const originalToolResultText = openAiInputItem.output;
    currentTurnFunctionCallOutputOriginalTextLength += originalToolResultText.length;

    if (
      input.crossStepReference !== undefined &&
      originalToolResultText.length >= duplicateReferenceMinimumCharacterCount &&
      !isInvalidFunctionCallOutputText(originalToolResultText) &&
      isInputItemOldEnoughForCrossStepReference({
        inputItemIndex,
        crossStepReference: input.crossStepReference,
      })
    ) {
      const crossStepReferenceText = createCrossStepCurrentTurnToolResultReferenceText({
        toolCallId: openAiInputItem.call_id,
        evidenceId: createToolResultEvidenceId(openAiInputItem.call_id),
        contentSha256: createSha256HexDigest(originalToolResultText),
        originalCharacterCount: originalToolResultText.length,
        visibleExcerptText: originalToolResultText.slice(0, CROSS_STEP_REFERENCE_EXCERPT_CHARACTER_COUNT),
      });
      if (crossStepReferenceText.length < originalToolResultText.length) {
        const projectedFunctionCallOutputItem: OpenAiFunctionCallOutputInputItem = {
          ...openAiInputItem,
          output: crossStepReferenceText,
        };
        projectedOpenAiInputItems[inputItemIndex] = projectedFunctionCallOutputItem;
        projectionMetadataByInputItemIndex.set(inputItemIndex, {
          projectionKind: "cross_step_reference",
          evidenceId: createToolResultEvidenceId(openAiInputItem.call_id),
          originalTextLength: originalToolResultText.length,
          projectedTextLength: crossStepReferenceText.length,
          originalSerializedByteLength: calculateSerializedUtf8ByteLength(openAiInputItem),
          projectedSerializedByteLength: calculateSerializedUtf8ByteLength(projectedFunctionCallOutputItem),
        });
        currentTurnFunctionCallOutputProjectedTextLength += crossStepReferenceText.length;
        compactedCurrentTurnFunctionCallOutputCount += 1;
        continue;
      }
    }

    const firstExactCurrentTurnToolResult = firstExactCurrentTurnToolResultByOutputText.get(originalToolResultText);
    const shouldKeepOutputExact = firstExactCurrentTurnToolResult === undefined ||
      originalToolResultText.length < duplicateReferenceMinimumCharacterCount ||
      isInvalidFunctionCallOutputText(originalToolResultText);

    if (shouldKeepOutputExact) {
      firstExactCurrentTurnToolResultByOutputText.set(originalToolResultText, {
        inputItemIndex,
        toolCallId: openAiInputItem.call_id,
        evidenceId: createToolResultEvidenceId(openAiInputItem.call_id),
        contentSha256: createSha256HexDigest(originalToolResultText),
      });
      currentTurnFunctionCallOutputProjectedTextLength += originalToolResultText.length;
      exactCurrentTurnFunctionCallOutputCount += 1;
      exactCurrentTurnFunctionCallOutputTextLength += originalToolResultText.length;
      continue;
    }

    const duplicateReferenceText = createDuplicateCurrentTurnToolResultReferenceText({
      duplicateToolCallId: openAiInputItem.call_id,
      duplicateEvidenceId: createToolResultEvidenceId(openAiInputItem.call_id),
      referenceToolCallId: firstExactCurrentTurnToolResult.toolCallId,
      referenceEvidenceId: firstExactCurrentTurnToolResult.evidenceId,
      referenceInputItemIndex: firstExactCurrentTurnToolResult.inputItemIndex,
      contentSha256: firstExactCurrentTurnToolResult.contentSha256,
      originalCharacterCount: originalToolResultText.length,
    });

    if (duplicateReferenceText.length >= originalToolResultText.length) {
      currentTurnFunctionCallOutputProjectedTextLength += originalToolResultText.length;
      exactCurrentTurnFunctionCallOutputCount += 1;
      exactCurrentTurnFunctionCallOutputTextLength += originalToolResultText.length;
      continue;
    }

    const projectedFunctionCallOutputItem: OpenAiFunctionCallOutputInputItem = {
      ...openAiInputItem,
      output: duplicateReferenceText,
    };
    projectedOpenAiInputItems[inputItemIndex] = projectedFunctionCallOutputItem;
    projectionMetadataByInputItemIndex.set(inputItemIndex, {
      projectionKind: "duplicate_reference",
      evidenceId: createToolResultEvidenceId(openAiInputItem.call_id),
      originalTextLength: originalToolResultText.length,
      projectedTextLength: duplicateReferenceText.length,
      originalSerializedByteLength: calculateSerializedUtf8ByteLength(openAiInputItem),
      projectedSerializedByteLength: calculateSerializedUtf8ByteLength(projectedFunctionCallOutputItem),
    });
    currentTurnFunctionCallOutputProjectedTextLength += duplicateReferenceText.length;
    compactedCurrentTurnFunctionCallOutputCount += 1;
  }

  return {
    projectedOpenAiInputItems,
    projectionMetadataByInputItemIndex,
    diagnostics: {
      requestCurrentTurnFunctionCallOutputOriginalTextLength: currentTurnFunctionCallOutputOriginalTextLength,
      requestCurrentTurnFunctionCallOutputProjectedTextLength: currentTurnFunctionCallOutputProjectedTextLength,
      requestCurrentTurnFunctionCallOutputSavedCharacterCount: currentTurnFunctionCallOutputOriginalTextLength -
        currentTurnFunctionCallOutputProjectedTextLength,
      requestCurrentTurnCompactedFunctionCallOutputCount: compactedCurrentTurnFunctionCallOutputCount,
      requestCurrentTurnExactWorkingSetFunctionCallOutputCount: exactCurrentTurnFunctionCallOutputCount,
      requestCurrentTurnExactWorkingSetFunctionCallOutputTextLength: exactCurrentTurnFunctionCallOutputTextLength,
    },
  };
}

function isInputItemOldEnoughForCrossStepReference(input: {
  inputItemIndex: number;
  crossStepReference: OpenAiCrossStepToolResultReplayReferenceInput;
}): boolean {
  const firstSentRequestIndex = input.crossStepReference.inputItemCountByBuiltRequestIndex.findIndex(
    (inputItemCount) => inputItemCount > input.inputItemIndex,
  );
  if (firstSentRequestIndex === -1) {
    return false;
  }
  return firstSentRequestIndex <= input.crossStepReference.currentRequestIndex - OPENAI_CROSS_STEP_TOOL_RESULT_REFERENCE_MIN_REQUEST_AGE;
}

function createCrossStepCurrentTurnToolResultReferenceText(input: {
  toolCallId: string;
  evidenceId: string;
  contentSha256: string;
  originalCharacterCount: number;
  visibleExcerptText: string;
}): string {
  return [
    "<cross_step_tool_result_reference>",
    `tool_call_id: ${input.toolCallId}`,
    `evidence_id: ${input.evidenceId}`,
    `content_sha256: ${input.contentSha256}`,
    `original_character_count: ${input.originalCharacterCount}`,
    "visible_excerpt:",
    input.visibleExcerptText,
    "The exact tool result text was shown in an earlier request of this same assistant turn and is stored unchanged. If the exact content is needed again, request the same tool call again instead of guessing.",
    "</cross_step_tool_result_reference>",
  ].join("\n");
}

function createDuplicateCurrentTurnToolResultReferenceText(input: {
  duplicateToolCallId: string;
  duplicateEvidenceId: string;
  referenceToolCallId: string;
  referenceEvidenceId: string;
  referenceInputItemIndex: number;
  contentSha256: string;
  originalCharacterCount: number;
}): string {
  return [
    "<duplicate_current_turn_tool_result_reference>",
    `duplicate_tool_call_id: ${input.duplicateToolCallId}`,
    `duplicate_evidence_id: ${input.duplicateEvidenceId}`,
    `reference_tool_call_id: ${input.referenceToolCallId}`,
    `reference_evidence_id: ${input.referenceEvidenceId}`,
    `reference_input_item_index: ${input.referenceInputItemIndex}`,
    `content_sha256: ${input.contentSha256}`,
    `original_character_count: ${input.originalCharacterCount}`,
    "The exact same tool result text is already visible earlier in this same OpenAI request. Use that earlier exact content as the evidence for this duplicate result.",
    "</duplicate_current_turn_tool_result_reference>",
  ].join("\n");
}

function isOpenAiFunctionCallOutputInputItem(
  openAiInputItem: OpenAiConversationInputItem,
): openAiInputItem is OpenAiFunctionCallOutputInputItem {
  return "type" in openAiInputItem && openAiInputItem.type === "function_call_output";
}

function isInvalidFunctionCallOutputText(toolResultText: string): boolean {
  return toolResultText.startsWith("Invalid function call:");
}

function createToolResultEvidenceId(toolCallId: string): string {
  return `tool_result:${toolCallId}`;
}

function createSha256HexDigest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function calculateSerializedUtf8ByteLength(value: OpenAiConversationInputItem): number {
  return textEncoder.encode(JSON.stringify(value)).byteLength;
}
