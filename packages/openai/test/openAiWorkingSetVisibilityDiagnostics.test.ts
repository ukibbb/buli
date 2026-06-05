import { expect, test } from "bun:test";
import type { OpenAiResponsesHttpRequestBody } from "../src/provider/openAiResponsesRequest.ts";
import type { OpenAiConversationInputItem } from "../src/provider/request.ts";
import {
  summarizeOpenAiWorkingSetVisibilityForDiagnostics,
  type OpenAiWorkingSetInputItemProjectionMetadata,
} from "../src/provider/openAiWorkingSetVisibilityDiagnostics.ts";

const textEncoder = new TextEncoder();

test("summarizeOpenAiWorkingSetVisibilityForDiagnostics classifies provider-visible items without changing request input", () => {
  const requestInputItems: OpenAiConversationInputItem[] = [
    {
      role: "user",
      content: "<conversation_compaction_summary>\nEarlier summary\n</conversation_compaction_summary>",
    },
    {
      role: "user",
      content: "Earlier user decision",
    },
    {
      role: "assistant",
      content: "Earlier assistant conclusion",
    },
    {
      role: "user",
      content: "Inspect the current workspace",
    },
    {
      type: "reasoning",
      id: "rs_1",
      encrypted_content: "encrypted-reasoning",
      summary: [{ type: "summary_text", text: "reasoned about tool use" }],
    },
    {
      type: "function_call",
      id: "fc_1",
      call_id: "call_1",
      name: "read",
      arguments: JSON.stringify({ filePath: "packages/openai/src/provider/turnSession.ts" }),
    },
    {
      type: "function_call_output",
      call_id: "call_1",
      output: `${"large exact tool evidence\n".repeat(20)}final exact line`,
    },
  ];
  const requestBody: OpenAiResponsesHttpRequestBody = {
    model: "gpt-5.4",
    instructions: "You are buli.",
    store: false,
    input: requestInputItems,
    stream: true,
  };
  const requestInputBeforeDiagnostics = JSON.stringify(requestInputItems);
  const functionCallOutputKeysBeforeDiagnostics = Object.keys(requestInputItems[6] ?? {});

  const diagnostics = summarizeOpenAiWorkingSetVisibilityForDiagnostics({
    requestBody,
    currentTurnFirstInputItemIndex: 4,
    largestVisibleInputItemCount: 3,
  });

  expect(JSON.stringify(requestInputItems)).toBe(requestInputBeforeDiagnostics);
  expect(Object.keys(requestInputItems[6] ?? {})).toEqual(functionCallOutputKeysBeforeDiagnostics);
  expect(diagnostics.inputItems.map((inputItem) => inputItem.visibilityReason)).toEqual([
    "compaction_summary",
    "recent_decision_context",
    "recent_decision_context",
    "active_user_intent",
    "provider_protocol_continuation",
    "provider_protocol_continuation",
    "current_turn_evidence",
  ]);
  expect(diagnostics.inputItems.map((inputItem) => inputItem.projectionKind)).toEqual([
    "exact",
    "exact",
    "exact",
    "exact",
    "exact",
    "exact",
    "exact",
  ]);
  expect(diagnostics.inputItems.map((inputItem) => inputItem.evidenceId)).toEqual([
    null,
    null,
    null,
    null,
    "reasoning:rs_1",
    "tool_call:call_1",
    "tool_result:call_1",
  ]);
  expect(diagnostics.diagnosticFields).toMatchObject({
    requestWorkingSetInputItemCount: 7,
    requestWorkingSetExactInputItemCount: 7,
    requestWorkingSetCompactedInputItemCount: 0,
    requestWorkingSetSavedCharacterCount: 0,
    requestWorkingSetSavedSerializedByteLength: 0,
    requestWorkingSetUnclassifiedInputItemCount: 0,
    requestWorkingSetVisibilityReasons: [
      "active_user_intent",
      "current_turn_evidence",
      "recent_decision_context",
      "compaction_summary",
      "provider_protocol_continuation",
    ],
    requestWorkingSetVisibilityReasonInputItemCounts: [1, 1, 2, 1, 2],
    requestWorkingSetLargestInputItemEvidenceIds: ["tool_result:call_1", "tool_call:call_1", "reasoning:rs_1"],
    requestWorkingSetLargestInputItemProjectionKinds: ["exact", "exact", "exact"],
    requestWorkingSetProjectionKinds: ["exact"],
    requestWorkingSetProjectionKindInputItemCounts: [7],
    requestWorkingSetProjectionKindSavedCharacterCounts: [0],
    requestWorkingSetProjectionKindSavedSerializedByteLengths: [0],
  });
  expect(diagnostics.diagnosticFields["requestWorkingSetOriginalTextLength"]).toBe(
    diagnostics.diagnosticFields["requestWorkingSetProjectedTextLength"],
  );
  expect(diagnostics.diagnosticFields["requestWorkingSetOriginalSerializedByteLength"]).toBe(
    diagnostics.diagnosticFields["requestWorkingSetProjectedSerializedByteLength"],
  );
});

test("summarizeOpenAiWorkingSetVisibilityForDiagnostics reports duplicate-reference projection savings", () => {
  const exactToolResultText = `${"duplicate exact tool evidence\n".repeat(400)}final exact line`;
  const duplicateReferenceText = [
    "<duplicate_current_turn_tool_result_reference>",
    "reference_evidence_id: tool_result:call_1",
    "</duplicate_current_turn_tool_result_reference>",
  ].join("\n");
  const originalDuplicateInputItem: OpenAiConversationInputItem = {
    type: "function_call_output",
    call_id: "call_2",
    output: exactToolResultText,
  };
  const projectedDuplicateInputItem: OpenAiConversationInputItem = {
    type: "function_call_output",
    call_id: "call_2",
    output: duplicateReferenceText,
  };
  const requestInputItems: OpenAiConversationInputItem[] = [
    {
      role: "user",
      content: "Inspect duplicate tool output",
    },
    {
      type: "function_call_output",
      call_id: "call_1",
      output: exactToolResultText,
    },
    projectedDuplicateInputItem,
  ];
  const duplicateProjectionMetadata: OpenAiWorkingSetInputItemProjectionMetadata = {
    projectionKind: "duplicate_reference",
    evidenceId: "tool_result:call_2",
    originalTextLength: exactToolResultText.length,
    projectedTextLength: duplicateReferenceText.length,
    originalSerializedByteLength: calculateSerializedUtf8ByteLength(originalDuplicateInputItem),
    projectedSerializedByteLength: calculateSerializedUtf8ByteLength(projectedDuplicateInputItem),
  };
  const requestBody: OpenAiResponsesHttpRequestBody = {
    model: "gpt-5.4",
    instructions: "You are buli.",
    store: false,
    input: requestInputItems,
    stream: true,
  };

  const diagnostics = summarizeOpenAiWorkingSetVisibilityForDiagnostics({
    requestBody,
    currentTurnFirstInputItemIndex: 1,
    projectionMetadataByInputItemIndex: new Map([[2, duplicateProjectionMetadata]]),
    largestVisibleInputItemCount: 3,
  });

  expect(diagnostics.inputItems.map((inputItem) => inputItem.projectionKind)).toEqual([
    "exact",
    "exact",
    "duplicate_reference",
  ]);
  expect(diagnostics.inputItems[2]).toMatchObject({
    evidenceId: "tool_result:call_2",
    originalTextLength: exactToolResultText.length,
    projectedTextLength: duplicateReferenceText.length,
    savedCharacterCount: exactToolResultText.length - duplicateReferenceText.length,
    originalSerializedByteLength: calculateSerializedUtf8ByteLength(originalDuplicateInputItem),
    projectedSerializedByteLength: calculateSerializedUtf8ByteLength(projectedDuplicateInputItem),
    savedSerializedByteLength: calculateSerializedUtf8ByteLength(originalDuplicateInputItem) -
      calculateSerializedUtf8ByteLength(projectedDuplicateInputItem),
  });
  expect(diagnostics.diagnosticFields).toMatchObject({
    requestWorkingSetInputItemCount: 3,
    requestWorkingSetExactInputItemCount: 2,
    requestWorkingSetCompactedInputItemCount: 1,
    requestWorkingSetSavedCharacterCount: exactToolResultText.length - duplicateReferenceText.length,
    requestWorkingSetSavedSerializedByteLength: calculateSerializedUtf8ByteLength(originalDuplicateInputItem) -
      calculateSerializedUtf8ByteLength(projectedDuplicateInputItem),
    requestWorkingSetProjectionKinds: ["exact", "duplicate_reference"],
    requestWorkingSetProjectionKindInputItemCounts: [2, 1],
    requestWorkingSetProjectionKindOriginalTextLengths: [
      "Inspect duplicate tool output".length + exactToolResultText.length,
      exactToolResultText.length,
    ],
    requestWorkingSetProjectionKindProjectedTextLengths: [
      "Inspect duplicate tool output".length + exactToolResultText.length,
      duplicateReferenceText.length,
    ],
    requestWorkingSetProjectionKindSavedCharacterCounts: [0, exactToolResultText.length - duplicateReferenceText.length],
    requestWorkingSetLargestInputItemProjectionKinds: ["exact", "duplicate_reference", "exact"],
    requestWorkingSetLargestInputItemEvidenceIds: ["tool_result:call_1", "tool_result:call_2", null],
  });
});

function calculateSerializedUtf8ByteLength(value: OpenAiConversationInputItem): number {
  return textEncoder.encode(JSON.stringify(value)).byteLength;
}
