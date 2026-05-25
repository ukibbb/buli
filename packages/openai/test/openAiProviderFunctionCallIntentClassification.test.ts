import { expect, test } from "bun:test";
import { classifyOpenAiProviderFunctionCallIntents } from "../src/provider/openAiProviderFunctionCallIntentClassification.ts";
test("classifyOpenAiProviderFunctionCallIntents identifies pure tool-call batches", () => {
  const classification = classifyOpenAiProviderFunctionCallIntents([
    {
      intentKind: "executable_tool",
      functionCallId: "call_read_1",
      toolCallRequest: { toolName: "read", readTargetPath: "README.md" },
    },
  ]);

  expect(classification.hasOnlyExecutableToolCallIntents).toBe(true);
});

test("classifyOpenAiProviderFunctionCallIntents separates invalid function calls from executable tools", () => {
  const classification = classifyOpenAiProviderFunctionCallIntents([
    {
      intentKind: "invalid_function_call",
      functionCallId: "call_invalid_1",
      functionName: "read",
      invalidCallExplanation: "malformed JSON",
    },
    {
      intentKind: "executable_tool",
      functionCallId: "call_read_1",
      toolCallRequest: { toolName: "read", readTargetPath: "README.md" },
    },
  ]);

  expect(classification.invalidFunctionCallIntents).toEqual([
    {
      intentKind: "invalid_function_call",
      functionCallId: "call_invalid_1",
      functionName: "read",
      invalidCallExplanation: "malformed JSON",
    },
  ]);
  expect(classification.requestedToolCalls).toEqual([
    {
      toolCallId: "call_read_1",
      toolCallRequest: { toolName: "read", readTargetPath: "README.md" },
    },
  ]);
  expect(classification.hasOnlyExecutableToolCallIntents).toBe(false);
});
