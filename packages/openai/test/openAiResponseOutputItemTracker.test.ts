import { expect, test } from "bun:test";
import { OpenAiResponseOutputItemTracker } from "../src/provider/openAiResponseOutputItemTracker.ts";

test("OpenAiResponseOutputItemTracker materializes assistant text deltas once for replay", () => {
  const outputItemTracker = new OpenAiResponseOutputItemTracker();

  outputItemTracker.appendAssistantOutputTextDelta({
    itemId: "msg_1",
    contentIndex: 0,
    deltaText: "Hel",
  });
  outputItemTracker.appendAssistantOutputTextDelta({
    itemId: "msg_1",
    contentIndex: 0,
    deltaText: "lo",
  });

  expect(outputItemTracker.createTrackedBackedResponseOutputItems(undefined)).toEqual([
    {
      type: "message",
      id: "msg_1",
      role: "assistant",
      content: [{ type: "output_text", text: "Hello" }],
    },
  ]);
});

test("OpenAiResponseOutputItemTracker preserves streamed reasoning summaries for replay", () => {
  const outputItemTracker = new OpenAiResponseOutputItemTracker();

  outputItemTracker.ensureReasoningSummaryPart({ itemId: "rs_1", outputIndex: 0, summaryIndex: 0 });
  outputItemTracker.appendReasoningSummaryTextDelta({
    itemId: "rs_1",
    outputIndex: 0,
    summaryIndex: 0,
    deltaText: "Think ",
  });
  outputItemTracker.appendReasoningSummaryTextDelta({
    itemId: "rs_1",
    outputIndex: 0,
    summaryIndex: 0,
    deltaText: "first.",
  });

  expect(outputItemTracker.createTrackedBackedResponseOutputItems([])).toEqual([
    {
      type: "reasoning",
      id: "rs_1",
      summary: [{ type: "summary_text", text: "Think first." }],
    },
  ]);
});

test("OpenAiResponseOutputItemTracker repairs function-call arguments from streamed deltas", () => {
  const outputItemTracker = new OpenAiResponseOutputItemTracker();

  outputItemTracker.setTrackedOutputItemAtIndex({
    outputIndex: 0,
    responseOutputItem: {
      type: "function_call",
      id: "fc_1",
      call_id: "call_1",
      name: "bash",
      arguments: "",
    },
  });
  outputItemTracker.appendFunctionCallArgumentsTextDeltaByItemId("fc_1", "{\"command\":");
  outputItemTracker.appendFunctionCallArgumentsTextDeltaByItemId("fc_1", "\"pwd\"}");

  expect(outputItemTracker.createTrackedBackedResponseOutputItems(undefined)).toEqual([
    {
      type: "function_call",
      id: "fc_1",
      call_id: "call_1",
      name: "bash",
      arguments: "{\"command\":\"pwd\"}",
    },
  ]);
});
