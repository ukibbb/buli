import { expect, test } from "bun:test";
import { projectCurrentTurnToolResultReplayForOpenAiRequest } from "../src/provider/openAiCurrentTurnToolResultReplayProjection.ts";
import type { OpenAiConversationInputItem } from "../src/provider/request.ts";

const largeToolResultText = `large evidence body\n${"distinct evidence line\n".repeat(1_000)}`;
const smallToolResultText = "small evidence body";

function createFunctionCallOutputItem(toolCallId: string, outputText: string): OpenAiConversationInputItem {
  return { type: "function_call_output", call_id: toolCallId, output: outputText };
}

test("cross-step references compact only old-enough large current-turn outputs", () => {
  const openAiInputItems: OpenAiConversationInputItem[] = [
    { role: "user", content: "Inspect files" },
    createFunctionCallOutputItem("call_old_large", largeToolResultText),
    createFunctionCallOutputItem("call_old_small", smallToolResultText),
    createFunctionCallOutputItem("call_recent_large", `${largeToolResultText}recent`),
  ];

  // Request history: request 0 contained items 0-2, request 1 contained items 0-3; building request 2 now.
  const projection = projectCurrentTurnToolResultReplayForOpenAiRequest({
    openAiInputItems,
    currentTurnFirstInputItemIndex: 1,
    crossStepReference: {
      currentRequestIndex: 2,
      inputItemCountByBuiltRequestIndex: [3, 4],
    },
  });

  const projectedOutputs = projection.projectedOpenAiInputItems.filter(
    (inputItem): inputItem is Extract<OpenAiConversationInputItem, { type: "function_call_output" }> =>
      "type" in inputItem && inputItem.type === "function_call_output",
  );
  const oldLargeOutput = projectedOutputs.find((inputItem) => inputItem.call_id === "call_old_large")?.output;
  expect(oldLargeOutput).toContain("<cross_step_tool_result_reference>");
  expect(oldLargeOutput).toContain("evidence_id: tool_result:call_old_large");
  expect(oldLargeOutput).toContain("visible_excerpt:");
  expect(projectedOutputs.find((inputItem) => inputItem.call_id === "call_old_small")?.output).toBe(smallToolResultText);
  expect(projectedOutputs.find((inputItem) => inputItem.call_id === "call_recent_large")?.output).toBe(
    `${largeToolResultText}recent`,
  );
  expect(projection.projectionMetadataByInputItemIndex.get(1)?.projectionKind).toBe("cross_step_reference");
  expect(projection.diagnostics.requestCurrentTurnCompactedFunctionCallOutputCount).toBe(1);
  expect(projection.diagnostics.requestCurrentTurnFunctionCallOutputSavedCharacterCount).toBeGreaterThan(0);
});

test("cross-step references stay disabled without cross-step request history input", () => {
  const openAiInputItems: OpenAiConversationInputItem[] = [
    { role: "user", content: "Inspect files" },
    createFunctionCallOutputItem("call_old_large", largeToolResultText),
  ];

  const projection = projectCurrentTurnToolResultReplayForOpenAiRequest({
    openAiInputItems,
    currentTurnFirstInputItemIndex: 1,
  });

  expect(projection.projectionMetadataByInputItemIndex.size).toBe(0);
  expect(projection.diagnostics.requestCurrentTurnCompactedFunctionCallOutputCount).toBe(0);
});

test("results never sent in an earlier request stay exact even when the flag is on", () => {
  const openAiInputItems: OpenAiConversationInputItem[] = [
    { role: "user", content: "Inspect files" },
    createFunctionCallOutputItem("call_new_large", largeToolResultText),
  ];

  const projection = projectCurrentTurnToolResultReplayForOpenAiRequest({
    openAiInputItems,
    currentTurnFirstInputItemIndex: 1,
    crossStepReference: {
      currentRequestIndex: 1,
      inputItemCountByBuiltRequestIndex: [1],
    },
  });

  const projectedOutput = projection.projectedOpenAiInputItems[1];
  expect(projectedOutput && "output" in projectedOutput ? projectedOutput.output : undefined).toBe(largeToolResultText);
});

test("same-request duplicates anchor to the next exact copy when the first occurrence became a cross-step reference", () => {
  const openAiInputItems: OpenAiConversationInputItem[] = [
    { role: "user", content: "Inspect files" },
    createFunctionCallOutputItem("call_first", largeToolResultText),
    createFunctionCallOutputItem("call_second", largeToolResultText),
    createFunctionCallOutputItem("call_third", largeToolResultText),
  ];

  // Request 0 contained items 0-1 only: the first copy is old enough to reference,
  // while the second and third copies are first sent in this request.
  const projection = projectCurrentTurnToolResultReplayForOpenAiRequest({
    openAiInputItems,
    currentTurnFirstInputItemIndex: 1,
    crossStepReference: {
      currentRequestIndex: 2,
      inputItemCountByBuiltRequestIndex: [2, 2],
    },
  });

  const projectedOutputs = projection.projectedOpenAiInputItems.filter(
    (inputItem): inputItem is Extract<OpenAiConversationInputItem, { type: "function_call_output" }> =>
      "type" in inputItem && inputItem.type === "function_call_output",
  );
  expect(projectedOutputs.find((inputItem) => inputItem.call_id === "call_first")?.output).toContain(
    "<cross_step_tool_result_reference>",
  );
  expect(projectedOutputs.find((inputItem) => inputItem.call_id === "call_second")?.output).toBe(largeToolResultText);
  expect(projectedOutputs.find((inputItem) => inputItem.call_id === "call_third")?.output).toContain(
    "reference_evidence_id: tool_result:call_second",
  );
});
