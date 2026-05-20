import { expect, test } from "bun:test";
import {
  chooseOpenAiResponseStepTerminalKind,
  createOpenAiResponseStepProviderFunctionCallTerminalState,
  createOpenAiResponseStepToolCallTerminalState,
} from "../src/provider/openAiResponseStepTerminalStateBuilder.ts";

const tokenUsage = { total: 1, input: 1, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };

test("createOpenAiResponseStepToolCallTerminalState creates single tool-call terminal state", () => {
  expect(createOpenAiResponseStepToolCallTerminalState({
    requestedToolCalls: [{
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    }],
    responseOutputItems: [{ type: "function_call", id: "fc_1" }],
    usage: tokenUsage,
  })).toEqual({
    terminalKind: "tool_call_requested",
    toolCallId: "call_1",
    toolCallRequest: {
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Print working directory",
    },
    responseOutputItems: [{ type: "function_call", id: "fc_1" }],
    usage: tokenUsage,
  });
});

test("createOpenAiResponseStepToolCallTerminalState creates multi tool-call terminal state", () => {
  expect(createOpenAiResponseStepToolCallTerminalState({
    requestedToolCalls: [
      {
        toolCallId: "call_1",
        toolCallRequest: { toolName: "read", readTargetPath: "README.md" },
      },
      {
        toolCallId: "call_2",
        toolCallRequest: { toolName: "glob", globPattern: "**/*.ts" },
      },
    ],
    responseOutputItems: [],
    usage: tokenUsage,
  })).toMatchObject({
    terminalKind: "tool_calls_requested",
    requestedToolCalls: [{ toolCallId: "call_1" }, { toolCallId: "call_2" }],
  });
});

test("chooseOpenAiResponseStepTerminalKind gives tool-call terminals priority", () => {
  expect(chooseOpenAiResponseStepTerminalKind({ requestedToolCallCount: 0, fallbackTerminalKind: "completed" })).toBe("completed");
  expect(chooseOpenAiResponseStepTerminalKind({ requestedToolCallCount: 1, fallbackTerminalKind: "completed" })).toBe("tool_call_requested");
  expect(chooseOpenAiResponseStepTerminalKind({ requestedToolCallCount: 2, fallbackTerminalKind: "incomplete" })).toBe("tool_calls_requested");
  expect(chooseOpenAiResponseStepTerminalKind({
    requestedToolCallCount: 0,
    presentationFunctionCallCount: 1,
    fallbackTerminalKind: "completed",
  })).toBe("provider_function_calls_requested");
});

test("createOpenAiResponseStepProviderFunctionCallTerminalState keeps presentation calls out of tool terminals", () => {
  expect(createOpenAiResponseStepProviderFunctionCallTerminalState({
    providerFunctionCallIntents: [
      {
        intentKind: "code_execution_walkthrough_presentation",
        functionCallId: "call_present_1",
        codeExecutionWalkthrough: {
          titleText: "Request flow",
          walkthroughKind: "source_walkthrough",
          steps: [{ stepTitle: "Prompt accepted", whatHappensText: "The accepted prompt is recorded.", codeExamples: [{ sourceFilePath: "src/runtime.ts", startLineNumber: 1, endLineNumber: 1, codeText: "start();" }] }],
        },
      },
    ],
    responseOutputItems: [{ type: "function_call", id: "fc_1" }],
    usage: tokenUsage,
  })).toEqual({
    terminalKind: "provider_function_calls_requested",
    providerFunctionCallIntents: [
      {
        intentKind: "code_execution_walkthrough_presentation",
        functionCallId: "call_present_1",
        codeExecutionWalkthrough: {
          titleText: "Request flow",
          walkthroughKind: "source_walkthrough",
          steps: [{ stepTitle: "Prompt accepted", whatHappensText: "The accepted prompt is recorded.", codeExamples: [{ sourceFilePath: "src/runtime.ts", startLineNumber: 1, endLineNumber: 1, codeText: "start();" }] }],
        },
      },
    ],
    responseOutputItems: [{ type: "function_call", id: "fc_1" }],
    usage: tokenUsage,
  });
});
