import { expect, test } from "bun:test";
import { OpenAiFunctionCallStreamAccumulator } from "../src/provider/openAiFunctionCallStreamAccumulator.ts";
import { readOpenAiFunctionCallOutputItem } from "../src/provider/openAiResponseObjects.ts";

function readFunctionCallItem(input: {
  itemId: string;
  toolCallId: string;
  functionName?: string;
  argumentsText?: string;
}) {
  const functionCallItem = readOpenAiFunctionCallOutputItem({
    type: "function_call",
    id: input.itemId,
    call_id: input.toolCallId,
    name: input.functionName ?? "bash",
    arguments: input.argumentsText ?? "",
  });
  if (!functionCallItem) {
    throw new Error("expected function call item");
  }

  return functionCallItem;
}

test("OpenAiFunctionCallStreamAccumulator waits for output item metadata before recording buffered deltas", () => {
  const functionCallStreamAccumulator = new OpenAiFunctionCallStreamAccumulator();

  functionCallStreamAccumulator.appendFunctionCallArgumentsDelta({ itemId: "fc_1", deltaText: '{"command":"pw' });
  functionCallStreamAccumulator.appendFunctionCallArgumentsDelta({
    itemId: "fc_1",
    deltaText: 'd","description":"Print working directory"}',
  });
  functionCallStreamAccumulator.observeFunctionCallOutputItem({
    functionCallItem: readFunctionCallItem({ itemId: "fc_1", toolCallId: "call_1" }),
    shouldRecordRequestedToolCallIfReady: false,
  });

  expect(functionCallStreamAccumulator.listPendingRequestedToolCalls()).toEqual([]);

  functionCallStreamAccumulator.observeFunctionCallOutputItem({
    functionCallItem: readFunctionCallItem({ itemId: "fc_1", toolCallId: "call_1" }),
    shouldRecordRequestedToolCallIfReady: true,
  });

  expect(functionCallStreamAccumulator.listPendingRequestedToolCalls()).toEqual([
    {
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
  ]);
});

test("OpenAiFunctionCallStreamAccumulator records completed arguments after output item metadata arrives", () => {
  const functionCallStreamAccumulator = new OpenAiFunctionCallStreamAccumulator();

  functionCallStreamAccumulator.completeFunctionCallArguments({
    itemId: "fc_1",
    argumentsText: '{"command":"pwd","description":"Print working directory"}',
  });
  functionCallStreamAccumulator.observeFunctionCallOutputItem({
    functionCallItem: readFunctionCallItem({ itemId: "fc_1", toolCallId: "call_1" }),
    shouldRecordRequestedToolCallIfReady: true,
  });

  expect(functionCallStreamAccumulator.listPendingRequestedToolCalls()).toEqual([
    {
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
  ]);
});

test("OpenAiFunctionCallStreamAccumulator emits each requested tool call once", () => {
  const functionCallStreamAccumulator = new OpenAiFunctionCallStreamAccumulator();

  functionCallStreamAccumulator.observeFunctionCallOutputItem({
    functionCallItem: readFunctionCallItem({
      itemId: "fc_1",
      toolCallId: "call_1",
      argumentsText: '{"command":"pwd","description":"Print working directory"}',
    }),
    shouldRecordRequestedToolCallIfReady: true,
  });
  functionCallStreamAccumulator.completeFunctionCallArguments({
    itemId: "fc_1",
    argumentsText: '{"command":"pwd","description":"Print working directory"}',
  });

  expect(functionCallStreamAccumulator.listPendingRequestedToolCalls()).toHaveLength(1);
});

test("OpenAiFunctionCallStreamAccumulator records malformed tool calls as invalid intents", () => {
  const functionCallStreamAccumulator = new OpenAiFunctionCallStreamAccumulator();

  functionCallStreamAccumulator.observeFunctionCallOutputItem({
    functionCallItem: readFunctionCallItem({
      itemId: "fc_1",
      toolCallId: "call_1",
      functionName: "read",
      argumentsText: "{not-json",
    }),
    shouldRecordRequestedToolCallIfReady: true,
  });

  expect(functionCallStreamAccumulator.listPendingRequestedToolCalls()).toEqual([]);
  expect(functionCallStreamAccumulator.listPendingProviderFunctionCallIntents()).toEqual([
    {
      intentKind: "invalid_function_call",
      functionCallId: "call_1",
      functionName: "read",
      invalidCallExplanation: expect.stringContaining("OpenAI function call for read has malformed JSON arguments"),
    },
  ]);
});

test("OpenAiFunctionCallStreamAccumulator preserves response output order", () => {
  const functionCallStreamAccumulator = new OpenAiFunctionCallStreamAccumulator();

  functionCallStreamAccumulator.recordProviderFunctionCallIntentsFromResponseOutputItems([
    {
      type: "function_call",
      id: "fc_1",
      call_id: "call_1",
      name: "bash",
      arguments: '{"command":"pwd","description":"Print working directory"}',
    },
    {
      type: "function_call",
      id: "fc_2",
      call_id: "call_2",
      name: "bash",
      arguments: '{"command":"ls","description":"List files"}',
    },
  ]);

  expect(functionCallStreamAccumulator.listPendingRequestedToolCalls().map((requestedToolCall) => requestedToolCall.toolCallId)).toEqual([
    "call_1",
    "call_2",
  ]);
});

test("OpenAiFunctionCallStreamAccumulator drains only newly executable tool calls", () => {
  const functionCallStreamAccumulator = new OpenAiFunctionCallStreamAccumulator();

  functionCallStreamAccumulator.observeFunctionCallOutputItem({
    functionCallItem: readFunctionCallItem({
      itemId: "fc_1",
      toolCallId: "call_1",
      argumentsText: '{"command":"pwd","description":"Print working directory"}',
    }),
    shouldRecordRequestedToolCallIfReady: true,
  });
  expect(functionCallStreamAccumulator.drainNewExecutableToolCallIntents().map((toolCallIntent) => toolCallIntent.functionCallId)).toEqual([
    "call_1",
  ]);
  expect(functionCallStreamAccumulator.drainNewExecutableToolCallIntents()).toEqual([]);

  functionCallStreamAccumulator.observeFunctionCallOutputItem({
    functionCallItem: readFunctionCallItem({
      itemId: "fc_2",
      toolCallId: "call_2",
      argumentsText: '{"command":"ls","description":"List files"}',
    }),
    shouldRecordRequestedToolCallIfReady: true,
  });

  expect(functionCallStreamAccumulator.drainNewExecutableToolCallIntents().map((toolCallIntent) => toolCallIntent.functionCallId)).toEqual([
    "call_2",
  ]);
});
