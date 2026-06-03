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

export type OpenAiWorkingSetProjectionKind = "exact";

export type OpenAiWorkingSetInputItemDiagnostics = Readonly<{
  inputItemIndex: number;
  visibilityReason: OpenAiWorkingSetVisibilityReason;
  projectionKind: OpenAiWorkingSetProjectionKind;
  evidenceId: string | null;
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

const DEFAULT_LARGEST_VISIBLE_INPUT_ITEM_COUNT = 10;
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
    })
  );
  const reasonAggregates = aggregateOpenAiWorkingSetVisibilityReasons(inputItems);
  const largestVisibleInputItemCount = input.largestVisibleInputItemCount ?? DEFAULT_LARGEST_VISIBLE_INPUT_ITEM_COUNT;
  const largestVisibleInputItems = [...inputItems]
    .sort((leftItem, rightItem) =>
      rightItem.serializedByteLength - leftItem.serializedByteLength || leftItem.inputItemIndex - rightItem.inputItemIndex
    )
    .slice(0, largestVisibleInputItemCount);
  const originalTextLength = sumInputItemTextLength(inputItems);
  const originalSerializedByteLength = sumInputItemSerializedByteLength(inputItems);
  const exactInputItemCount = inputItems.filter((inputItem) => inputItem.projectionKind === "exact").length;
  const unclassifiedInputItemCount = inputItems.filter((inputItem) => inputItem.visibilityReason === "unclassified").length;

  // This diagnostic is intentionally sidecar-only. It measures the provider-visible
  // working set without adding fields to OpenAI input items, provider-turn replay,
  // or request JSON. This conservative slice reports the projection as exact, so
  // every saved/compacted field must remain zero until a separate eval-gated change
  // intentionally alters model-visible content.
  const diagnosticFields: BuliDiagnosticLogFields = {
    requestWorkingSetInputItemCount: inputItems.length,
    requestWorkingSetExactInputItemCount: exactInputItemCount,
    requestWorkingSetCompactedInputItemCount: 0,
    requestWorkingSetOriginalTextLength: originalTextLength,
    requestWorkingSetProjectedTextLength: originalTextLength,
    requestWorkingSetSavedCharacterCount: 0,
    requestWorkingSetOriginalSerializedByteLength: originalSerializedByteLength,
    requestWorkingSetProjectedSerializedByteLength: originalSerializedByteLength,
    requestWorkingSetSavedSerializedByteLength: 0,
    requestWorkingSetUnclassifiedInputItemCount: unclassifiedInputItemCount,
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
}): OpenAiWorkingSetInputItemDiagnostics {
  const isCurrentTurnItem = input.inputItemIndex >= input.currentTurnFirstInputItemIndex;
  return {
    inputItemIndex: input.inputItemIndex,
    visibilityReason: classifyOpenAiInputItemVisibilityReason({
      openAiInputItem: input.openAiInputItem,
      inputItemIndex: input.inputItemIndex,
      isCurrentTurnItem,
      activeUserIntentInputItemIndex: input.activeUserIntentInputItemIndex,
    }),
    projectionKind: "exact",
    evidenceId: createOpenAiInputItemEvidenceId(input.openAiInputItem),
    textLength: calculateOpenAiInputItemTextLength(input.openAiInputItem),
    serializedByteLength: calculateSerializedUtf8ByteLength(input.openAiInputItem),
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

function sumInputItemSerializedByteLength(
  inputItems: readonly Pick<OpenAiWorkingSetInputItemDiagnostics, "serializedByteLength">[],
): number {
  return inputItems.reduce(
    (totalSerializedByteLength, inputItem) => totalSerializedByteLength + inputItem.serializedByteLength,
    0,
  );
}
