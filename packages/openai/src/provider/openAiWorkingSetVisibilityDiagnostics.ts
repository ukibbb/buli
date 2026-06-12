import type { BuliDiagnosticLogFields } from "@buli/contracts";
import type { OpenAiResponsesHttpRequestBody } from "./openAiResponsesRequest.ts";
import type { OpenAiConversationInputItem } from "./request.ts";

export type OpenAiWorkingSetVisibilityReason =
  | "active_user_intent"
  | "active_instructions"
  | "current_turn_evidence"
  | "recent_decision_context"
  | "failure_recovery_context"
  | "compaction_summary"
  | "explicit_user_referenced_context"
  | "provider_protocol_continuation"
  | "unclassified";

export type OpenAiWorkingSetProjectionKind = "exact" | "duplicate_reference" | "cross_step_reference";

export type OpenAiWorkingSetInputItemProjectionMetadata = Readonly<{
  projectionKind: OpenAiWorkingSetProjectionKind;
  evidenceId: string | null;
  originalTextLength: number;
  projectedTextLength: number;
  originalSerializedByteLength: number;
  projectedSerializedByteLength: number;
}>;

export type OpenAiWorkingSetInputItemDiagnostics = Readonly<{
  inputItemIndex: number;
  visibilityReason: OpenAiWorkingSetVisibilityReason;
  projectionKind: OpenAiWorkingSetProjectionKind;
  evidenceId: string | null;
  originalTextLength: number;
  projectedTextLength: number;
  savedCharacterCount: number;
  originalSerializedByteLength: number;
  projectedSerializedByteLength: number;
  savedSerializedByteLength: number;
  textLength: number;
  serializedByteLength: number;
  isCurrentTurnItem: boolean;
}>;

export type OpenAiWorkingSetVisibilityDiagnostics = Readonly<{
  inputItems: readonly OpenAiWorkingSetInputItemDiagnostics[];
  diagnosticFields: BuliDiagnosticLogFields;
}>;

type OpenAiWorkingSetVisibilityReasonAggregate = Readonly<{
  visibilityReason: OpenAiWorkingSetVisibilityReason;
  inputItemCount: number;
  textLength: number;
  serializedByteLength: number;
}>;

type OpenAiWorkingSetProjectionKindAggregate = Readonly<{
  projectionKind: OpenAiWorkingSetProjectionKind;
  inputItemCount: number;
  originalTextLength: number;
  projectedTextLength: number;
  savedCharacterCount: number;
  originalSerializedByteLength: number;
  projectedSerializedByteLength: number;
  savedSerializedByteLength: number;
}>;

const DEFAULT_LARGEST_VISIBLE_INPUT_ITEM_COUNT = 10;
const OPENAI_WORKING_SET_PROJECTION_KINDS: readonly OpenAiWorkingSetProjectionKind[] = ["exact", "duplicate_reference", "cross_step_reference"];
const OPENAI_WORKING_SET_VISIBILITY_REASONS: readonly OpenAiWorkingSetVisibilityReason[] = [
  "active_user_intent",
  "active_instructions",
  "current_turn_evidence",
  "recent_decision_context",
  "failure_recovery_context",
  "compaction_summary",
  "explicit_user_referenced_context",
  "provider_protocol_continuation",
  "unclassified",
];
const textEncoder = new TextEncoder();

export function summarizeOpenAiWorkingSetVisibilityForDiagnostics(input: {
  requestBody: OpenAiResponsesHttpRequestBody;
  currentTurnFirstInputItemIndex: number;
  projectionMetadataByInputItemIndex?: ReadonlyMap<number, OpenAiWorkingSetInputItemProjectionMetadata> | undefined;
  largestVisibleInputItemCount?: number;
}): OpenAiWorkingSetVisibilityDiagnostics {
  const activeUserIntentInputItemIndex = findActiveUserIntentInputItemIndex({
    openAiInputItems: input.requestBody.input,
    currentTurnFirstInputItemIndex: input.currentTurnFirstInputItemIndex,
  });
  const inputItems = input.requestBody.input.map((openAiInputItem, inputItemIndex) =>
    createOpenAiWorkingSetInputItemDiagnostics({
      openAiInputItem,
      inputItemIndex,
      currentTurnFirstInputItemIndex: input.currentTurnFirstInputItemIndex,
      activeUserIntentInputItemIndex,
      projectionMetadata: input.projectionMetadataByInputItemIndex?.get(inputItemIndex),
    })
  );
  const reasonAggregates = aggregateOpenAiWorkingSetVisibilityReasons(inputItems);
  const projectionKindAggregates = aggregateOpenAiWorkingSetProjectionKinds(inputItems);
  const largestVisibleInputItemCount = input.largestVisibleInputItemCount ?? DEFAULT_LARGEST_VISIBLE_INPUT_ITEM_COUNT;
  const largestVisibleInputItems = [...inputItems]
    .sort((leftItem, rightItem) =>
      rightItem.serializedByteLength - leftItem.serializedByteLength || leftItem.inputItemIndex - rightItem.inputItemIndex
    )
    .slice(0, largestVisibleInputItemCount);
  const originalTextLength = sumInputItemOriginalTextLength(inputItems);
  const projectedTextLength = sumInputItemProjectedTextLength(inputItems);
  const savedCharacterCount = sumInputItemSavedCharacterCount(inputItems);
  const originalSerializedByteLength = sumInputItemOriginalSerializedByteLength(inputItems);
  const projectedSerializedByteLength = sumInputItemProjectedSerializedByteLength(inputItems);
  const savedSerializedByteLength = sumInputItemSavedSerializedByteLength(inputItems);
  const exactInputItemCount = inputItems.filter((inputItem) => inputItem.projectionKind === "exact").length;
  const compactedInputItemCount = inputItems.length - exactInputItemCount;
  const unclassifiedInputItemCount = inputItems.filter((inputItem) => inputItem.visibilityReason === "unclassified").length;

  // This diagnostic stays sidecar-only: projection metadata explains how a request
  // was projected without adding diagnostic fields to OpenAI input items, raw
  // session evidence, or stored provider-turn replay.
  const diagnosticFields: BuliDiagnosticLogFields = {
    requestWorkingSetInputItemCount: inputItems.length,
    requestWorkingSetExactInputItemCount: exactInputItemCount,
    requestWorkingSetCompactedInputItemCount: compactedInputItemCount,
    requestWorkingSetOriginalTextLength: originalTextLength,
    requestWorkingSetProjectedTextLength: projectedTextLength,
    requestWorkingSetSavedCharacterCount: savedCharacterCount,
    requestWorkingSetOriginalSerializedByteLength: originalSerializedByteLength,
    requestWorkingSetProjectedSerializedByteLength: projectedSerializedByteLength,
    requestWorkingSetSavedSerializedByteLength: savedSerializedByteLength,
    requestWorkingSetUnclassifiedInputItemCount: unclassifiedInputItemCount,
    requestWorkingSetProjectionKinds: projectionKindAggregates.map((aggregate) => aggregate.projectionKind),
    requestWorkingSetProjectionKindInputItemCounts: projectionKindAggregates.map((aggregate) => aggregate.inputItemCount),
    requestWorkingSetProjectionKindOriginalTextLengths: projectionKindAggregates.map((aggregate) => aggregate.originalTextLength),
    requestWorkingSetProjectionKindProjectedTextLengths: projectionKindAggregates.map((aggregate) => aggregate.projectedTextLength),
    requestWorkingSetProjectionKindSavedCharacterCounts: projectionKindAggregates.map((aggregate) => aggregate.savedCharacterCount),
    requestWorkingSetProjectionKindOriginalSerializedByteLengths: projectionKindAggregates.map((aggregate) => aggregate.originalSerializedByteLength),
    requestWorkingSetProjectionKindProjectedSerializedByteLengths: projectionKindAggregates.map((aggregate) => aggregate.projectedSerializedByteLength),
    requestWorkingSetProjectionKindSavedSerializedByteLengths: projectionKindAggregates.map((aggregate) => aggregate.savedSerializedByteLength),
    requestWorkingSetVisibilityReasons: reasonAggregates.map((aggregate) => aggregate.visibilityReason),
    requestWorkingSetVisibilityReasonInputItemCounts: reasonAggregates.map((aggregate) => aggregate.inputItemCount),
    requestWorkingSetVisibilityReasonTextLengths: reasonAggregates.map((aggregate) => aggregate.textLength),
    requestWorkingSetVisibilityReasonSerializedByteLengths: reasonAggregates.map((aggregate) => aggregate.serializedByteLength),
    requestWorkingSetLargestInputItemIndexes: largestVisibleInputItems.map((inputItem) => inputItem.inputItemIndex),
    requestWorkingSetLargestInputItemVisibilityReasons: largestVisibleInputItems.map((inputItem) => inputItem.visibilityReason),
    requestWorkingSetLargestInputItemProjectionKinds: largestVisibleInputItems.map((inputItem) => inputItem.projectionKind),
    requestWorkingSetLargestInputItemEvidenceIds: largestVisibleInputItems.map((inputItem) => inputItem.evidenceId),
    requestWorkingSetLargestInputItemTextLengths: largestVisibleInputItems.map((inputItem) => inputItem.textLength),
    requestWorkingSetLargestInputItemSerializedByteLengths: largestVisibleInputItems.map((inputItem) => inputItem.serializedByteLength),
    requestWorkingSetLargestInputItemCurrentTurnFlags: largestVisibleInputItems.map((inputItem) => inputItem.isCurrentTurnItem),
  };

  return {
    inputItems,
    diagnosticFields,
  };
}

function createOpenAiWorkingSetInputItemDiagnostics(input: {
  openAiInputItem: OpenAiConversationInputItem;
  inputItemIndex: number;
  currentTurnFirstInputItemIndex: number;
  activeUserIntentInputItemIndex: number | undefined;
  projectionMetadata: OpenAiWorkingSetInputItemProjectionMetadata | undefined;
}): OpenAiWorkingSetInputItemDiagnostics {
  const isCurrentTurnItem = input.inputItemIndex >= input.currentTurnFirstInputItemIndex;
  const projectedTextLength = input.projectionMetadata?.projectedTextLength ?? calculateOpenAiInputItemTextLength(input.openAiInputItem);
  const projectedSerializedByteLength = input.projectionMetadata?.projectedSerializedByteLength ??
    calculateSerializedUtf8ByteLength(input.openAiInputItem);
  const originalTextLength = input.projectionMetadata?.originalTextLength ?? projectedTextLength;
  const originalSerializedByteLength = input.projectionMetadata?.originalSerializedByteLength ?? projectedSerializedByteLength;
  return {
    inputItemIndex: input.inputItemIndex,
    visibilityReason: classifyOpenAiInputItemVisibilityReason({
      openAiInputItem: input.openAiInputItem,
      inputItemIndex: input.inputItemIndex,
      isCurrentTurnItem,
      activeUserIntentInputItemIndex: input.activeUserIntentInputItemIndex,
    }),
    projectionKind: input.projectionMetadata?.projectionKind ?? "exact",
    evidenceId: input.projectionMetadata?.evidenceId ?? createOpenAiInputItemEvidenceId(input.openAiInputItem),
    originalTextLength,
    projectedTextLength,
    savedCharacterCount: originalTextLength - projectedTextLength,
    originalSerializedByteLength,
    projectedSerializedByteLength,
    savedSerializedByteLength: originalSerializedByteLength - projectedSerializedByteLength,
    textLength: projectedTextLength,
    serializedByteLength: projectedSerializedByteLength,
    isCurrentTurnItem,
  };
}

function classifyOpenAiInputItemVisibilityReason(input: {
  openAiInputItem: OpenAiConversationInputItem;
  inputItemIndex: number;
  isCurrentTurnItem: boolean;
  activeUserIntentInputItemIndex: number | undefined;
}): OpenAiWorkingSetVisibilityReason {
  if (input.isCurrentTurnItem) {
    if ("type" in input.openAiInputItem && input.openAiInputItem.type === "function_call_output") {
      return "current_turn_evidence";
    }
    return "provider_protocol_continuation";
  }

  if ("role" in input.openAiInputItem) {
    if (isOpenAiCompactionSummaryMessageInputItem(input.openAiInputItem)) {
      return "compaction_summary";
    }
    if (input.openAiInputItem.role === "user" && input.inputItemIndex === input.activeUserIntentInputItemIndex) {
      return "active_user_intent";
    }
    return "recent_decision_context";
  }

  return "recent_decision_context";
}

function createOpenAiInputItemEvidenceId(openAiInputItem: OpenAiConversationInputItem): string | null {
  if (!("type" in openAiInputItem)) {
    return null;
  }
  if (openAiInputItem.type === "function_call_output") {
    return `tool_result:${openAiInputItem.call_id}`;
  }
  if (openAiInputItem.type === "function_call") {
    return `tool_call:${openAiInputItem.call_id}`;
  }
  return `reasoning:${openAiInputItem.id}`;
}

function findActiveUserIntentInputItemIndex(input: {
  openAiInputItems: readonly OpenAiConversationInputItem[];
  currentTurnFirstInputItemIndex: number;
}): number | undefined {
  for (let inputItemIndex = input.currentTurnFirstInputItemIndex - 1; inputItemIndex >= 0; inputItemIndex -= 1) {
    const openAiInputItem = input.openAiInputItems[inputItemIndex];
    if (
      openAiInputItem &&
      "role" in openAiInputItem &&
      openAiInputItem.role === "user" &&
      !isOpenAiCompactionSummaryMessageInputItem(openAiInputItem)
    ) {
      return inputItemIndex;
    }
  }

  return undefined;
}

function aggregateOpenAiWorkingSetVisibilityReasons(
  inputItems: readonly OpenAiWorkingSetInputItemDiagnostics[],
): readonly OpenAiWorkingSetVisibilityReasonAggregate[] {
  return OPENAI_WORKING_SET_VISIBILITY_REASONS.map((visibilityReason) => {
    const itemsForReason = inputItems.filter((inputItem) => inputItem.visibilityReason === visibilityReason);
    return {
      visibilityReason,
      inputItemCount: itemsForReason.length,
      textLength: sumInputItemTextLength(itemsForReason),
      serializedByteLength: sumInputItemSerializedByteLength(itemsForReason),
    };
  }).filter((aggregate) => aggregate.inputItemCount > 0);
}

function aggregateOpenAiWorkingSetProjectionKinds(
  inputItems: readonly OpenAiWorkingSetInputItemDiagnostics[],
): readonly OpenAiWorkingSetProjectionKindAggregate[] {
  return OPENAI_WORKING_SET_PROJECTION_KINDS.map((projectionKind) => {
    const itemsForProjectionKind = inputItems.filter((inputItem) => inputItem.projectionKind === projectionKind);
    return {
      projectionKind,
      inputItemCount: itemsForProjectionKind.length,
      originalTextLength: sumInputItemOriginalTextLength(itemsForProjectionKind),
      projectedTextLength: sumInputItemProjectedTextLength(itemsForProjectionKind),
      savedCharacterCount: sumInputItemSavedCharacterCount(itemsForProjectionKind),
      originalSerializedByteLength: sumInputItemOriginalSerializedByteLength(itemsForProjectionKind),
      projectedSerializedByteLength: sumInputItemProjectedSerializedByteLength(itemsForProjectionKind),
      savedSerializedByteLength: sumInputItemSavedSerializedByteLength(itemsForProjectionKind),
    };
  }).filter((aggregate) => aggregate.inputItemCount > 0);
}

function isOpenAiCompactionSummaryMessageInputItem(
  openAiInputItem: Extract<OpenAiConversationInputItem, { role: "user" | "assistant" }>,
): boolean {
  return calculateOpenAiInputItemVisibleText(openAiInputItem).trimStart().startsWith("<conversation_compaction_summary>");
}

function calculateOpenAiInputItemTextLength(openAiInputItem: OpenAiConversationInputItem): number {
  if ("role" in openAiInputItem) {
    return calculateOpenAiInputItemVisibleText(openAiInputItem).length;
  }
  if (openAiInputItem.type === "reasoning") {
    return (openAiInputItem.encrypted_content?.length ?? 0) +
      openAiInputItem.summary.reduce((summaryTextLength, summaryPart) => summaryTextLength + summaryPart.text.length, 0);
  }
  if (openAiInputItem.type === "function_call") {
    return openAiInputItem.arguments.length;
  }
  return openAiInputItem.output.length;
}

function calculateOpenAiInputItemVisibleText(
  openAiInputItem: Extract<OpenAiConversationInputItem, { role: "user" | "assistant" }>,
): string {
  if (typeof openAiInputItem.content === "string") {
    return openAiInputItem.content;
  }
  return openAiInputItem.content.map((contentPart) =>
    contentPart.type === "input_text" ? contentPart.text : contentPart.image_url
  ).join("");
}

function calculateSerializedUtf8ByteLength(value: OpenAiConversationInputItem): number {
  return textEncoder.encode(JSON.stringify(value)).byteLength;
}

function sumInputItemTextLength(inputItems: readonly Pick<OpenAiWorkingSetInputItemDiagnostics, "textLength">[]): number {
  return inputItems.reduce((totalTextLength, inputItem) => totalTextLength + inputItem.textLength, 0);
}

function sumInputItemOriginalTextLength(
  inputItems: readonly Pick<OpenAiWorkingSetInputItemDiagnostics, "originalTextLength">[],
): number {
  return inputItems.reduce((totalTextLength, inputItem) => totalTextLength + inputItem.originalTextLength, 0);
}

function sumInputItemProjectedTextLength(
  inputItems: readonly Pick<OpenAiWorkingSetInputItemDiagnostics, "projectedTextLength">[],
): number {
  return inputItems.reduce((totalTextLength, inputItem) => totalTextLength + inputItem.projectedTextLength, 0);
}

function sumInputItemSavedCharacterCount(
  inputItems: readonly Pick<OpenAiWorkingSetInputItemDiagnostics, "savedCharacterCount">[],
): number {
  return inputItems.reduce((savedCharacterCount, inputItem) => savedCharacterCount + inputItem.savedCharacterCount, 0);
}

function sumInputItemSerializedByteLength(
  inputItems: readonly Pick<OpenAiWorkingSetInputItemDiagnostics, "serializedByteLength">[],
): number {
  return inputItems.reduce(
    (totalSerializedByteLength, inputItem) => totalSerializedByteLength + inputItem.serializedByteLength,
    0,
  );
}

function sumInputItemOriginalSerializedByteLength(
  inputItems: readonly Pick<OpenAiWorkingSetInputItemDiagnostics, "originalSerializedByteLength">[],
): number {
  return inputItems.reduce(
    (totalSerializedByteLength, inputItem) => totalSerializedByteLength + inputItem.originalSerializedByteLength,
    0,
  );
}

function sumInputItemProjectedSerializedByteLength(
  inputItems: readonly Pick<OpenAiWorkingSetInputItemDiagnostics, "projectedSerializedByteLength">[],
): number {
  return inputItems.reduce(
    (totalSerializedByteLength, inputItem) => totalSerializedByteLength + inputItem.projectedSerializedByteLength,
    0,
  );
}

function sumInputItemSavedSerializedByteLength(
  inputItems: readonly Pick<OpenAiWorkingSetInputItemDiagnostics, "savedSerializedByteLength">[],
): number {
  return inputItems.reduce(
    (savedSerializedByteLength, inputItem) => savedSerializedByteLength + inputItem.savedSerializedByteLength,
    0,
  );
}
