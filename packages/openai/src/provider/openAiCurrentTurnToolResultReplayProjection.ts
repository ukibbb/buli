import { createHash } from "node:crypto";
import type { OpenAiWorkingSetInputItemProjectionMetadata } from "./openAiWorkingSetVisibilityDiagnostics.ts";
import type { OpenAiConversationInputItem, OpenAiFunctionCallOutputInputItem } from "./request.ts";

export const OPENAI_CURRENT_TURN_DUPLICATE_TOOL_RESULT_REFERENCE_MIN_CHARACTER_COUNT = 8_192;

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
