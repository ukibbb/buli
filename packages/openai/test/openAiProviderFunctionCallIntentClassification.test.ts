import { expect, test } from "bun:test";
import { classifyOpenAiProviderFunctionCallIntents } from "../src/provider/openAiProviderFunctionCallIntentClassification.ts";
import type { OpenAiProviderFunctionCallIntent } from "../src/provider/toolDefinitions.ts";

test("classifyOpenAiProviderFunctionCallIntents splits executable tools and presentation calls", () => {
  const providerFunctionCallIntents: OpenAiProviderFunctionCallIntent[] = [
    {
      intentKind: "executable_tool",
      functionCallId: "call_read_1",
      toolCallRequest: { toolName: "read", readTargetPath: "README.md" },
    },
    {
      intentKind: "code_execution_walkthrough_presentation",
      functionCallId: "call_present_1",
      codeExecutionWalkthrough: {
        titleText: "Request flow",
        walkthroughKind: "source_walkthrough",
        steps: [
          {
            stepTitle: "Prompt accepted",
            whatHappensText: "The accepted prompt is recorded.",
            codeExamples: [
              {
                sourceFilePath: "src/runtime.ts",
                startLineNumber: 1,
                endLineNumber: 1,
                codeText: "start();",
              },
            ],
          },
        ],
      },
    },
    {
      intentKind: "executable_tool",
      functionCallId: "call_glob_1",
      toolCallRequest: { toolName: "glob", globPattern: "**/*.ts" },
    },
  ];

  const classification = classifyOpenAiProviderFunctionCallIntents(providerFunctionCallIntents);

  expect(classification.requestedToolCalls).toEqual([
    {
      toolCallId: "call_read_1",
      toolCallRequest: { toolName: "read", readTargetPath: "README.md" },
    },
    {
      toolCallId: "call_glob_1",
      toolCallRequest: { toolName: "glob", globPattern: "**/*.ts" },
    },
  ]);
  expect(classification.presentationFunctionCallIntents.map((providerFunctionCallIntent) => providerFunctionCallIntent.functionCallId)).toEqual([
    "call_present_1",
  ]);
  expect(classification.hasOnlyExecutableToolCallIntents).toBe(false);
});

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
