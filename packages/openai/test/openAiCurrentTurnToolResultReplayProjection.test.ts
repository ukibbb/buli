import { expect, test } from "bun:test";
import { projectCurrentTurnToolResultReplayForOpenAiRequest } from "../src/provider/openAiCurrentTurnToolResultReplayProjection.ts";
import type { OpenAiConversationInputItem } from "../src/provider/request.ts";

test("projectCurrentTurnToolResultReplayForOpenAiRequest references only large duplicate current-turn outputs", () => {
  const largeDuplicateToolResultText = `large duplicate evidence\n${"same line\n".repeat(1_000)}`;
  const smallDuplicateToolResultText = "same small evidence";
  const invalidFunctionCallOutputText = [
    "Invalid function call: read",
    "Reason: missing JSON arguments",
    "The function call was not executed.",
  ].join("\n");
  const openAiInputItems: OpenAiConversationInputItem[] = [
    {
      role: "user",
      content: "Read duplicate files",
    },
    {
      type: "function_call_output",
      call_id: "call_large_1",
      output: largeDuplicateToolResultText,
    },
    {
      type: "function_call_output",
      call_id: "call_large_2",
      output: largeDuplicateToolResultText,
    },
    {
      type: "function_call_output",
      call_id: "call_small_1",
      output: smallDuplicateToolResultText,
    },
    {
      type: "function_call_output",
      call_id: "call_small_2",
      output: smallDuplicateToolResultText,
    },
    {
      type: "function_call_output",
      call_id: "call_invalid_1",
      output: invalidFunctionCallOutputText,
    },
    {
      type: "function_call_output",
      call_id: "call_invalid_2",
      output: invalidFunctionCallOutputText,
    },
  ];
  const inputItemsBeforeProjection = JSON.stringify(openAiInputItems);

  const projection = projectCurrentTurnToolResultReplayForOpenAiRequest({
    openAiInputItems,
    currentTurnFirstInputItemIndex: 1,
  });

  const projectedFunctionCallOutputs = projection.projectedOpenAiInputItems.filter(
    (inputItem): inputItem is Extract<OpenAiConversationInputItem, { type: "function_call_output" }> =>
      "type" in inputItem && inputItem.type === "function_call_output",
  );
  expect(JSON.stringify(openAiInputItems)).toBe(inputItemsBeforeProjection);
  expect(projectedFunctionCallOutputs.find((inputItem) => inputItem.call_id === "call_large_1")?.output).toBe(
    largeDuplicateToolResultText,
  );
  expect(projectedFunctionCallOutputs.find((inputItem) => inputItem.call_id === "call_large_2")?.output).toContain(
    "reference_evidence_id: tool_result:call_large_1",
  );
  expect(projectedFunctionCallOutputs.find((inputItem) => inputItem.call_id === "call_small_2")?.output).toBe(
    smallDuplicateToolResultText,
  );
  expect(projectedFunctionCallOutputs.find((inputItem) => inputItem.call_id === "call_invalid_2")?.output).toBe(
    invalidFunctionCallOutputText,
  );
  expect(projection.projectionMetadataByInputItemIndex.get(2)).toMatchObject({
    projectionKind: "duplicate_reference",
    evidenceId: "tool_result:call_large_2",
    originalTextLength: largeDuplicateToolResultText.length,
  });
  expect(projection.projectionMetadataByInputItemIndex.has(4)).toBe(false);
  expect(projection.projectionMetadataByInputItemIndex.has(6)).toBe(false);
  expect(projection.diagnostics.requestCurrentTurnCompactedFunctionCallOutputCount).toBe(1);
  expect(projection.diagnostics.requestCurrentTurnExactWorkingSetFunctionCallOutputCount).toBe(5);
  expect(projection.diagnostics.requestCurrentTurnFunctionCallOutputSavedCharacterCount).toBeGreaterThan(0);
});

test("projectCurrentTurnToolResultReplayForOpenAiRequest does not reference historical exact outputs", () => {
  const repeatedToolResultText = `historical duplicate\n${"same line\n".repeat(1_000)}`;
  const openAiInputItems: OpenAiConversationInputItem[] = [
    {
      type: "function_call_output",
      call_id: "call_historical",
      output: repeatedToolResultText,
    },
    {
      type: "function_call_output",
      call_id: "call_current",
      output: repeatedToolResultText,
    },
  ];

  const projection = projectCurrentTurnToolResultReplayForOpenAiRequest({
    openAiInputItems,
    currentTurnFirstInputItemIndex: 1,
  });

  expect(projection.projectedOpenAiInputItems[1]).toEqual(openAiInputItems[1]);
  expect(projection.projectionMetadataByInputItemIndex.size).toBe(0);
  expect(projection.diagnostics.requestCurrentTurnCompactedFunctionCallOutputCount).toBe(0);
});
