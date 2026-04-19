import { expect, test } from "bun:test";
import { createOpenAiResponseReplayItems, createOpenAiResponsesInputItems } from "../src/provider/request.ts";

test("createOpenAiResponsesInputItems serializes replayed conversation messages as plain string content", () => {
  expect(
    createOpenAiResponsesInputItems([
      {
        entryKind: "user_prompt",
        promptText: "Tell me a joke",
        modelFacingPromptText: "Tell me a joke",
      },
      {
        entryKind: "assistant_message",
        assistantMessageText: "Knock knock.",
      },
    ]),
  ).toEqual([
    {
      role: "user",
      content: "Tell me a joke",
    },
    {
      role: "assistant",
      content: "Knock knock.",
    },
  ]);
});

test("createOpenAiResponsesInputItems replays stored OpenAI tool items before the assistant message", () => {
  expect(
    createOpenAiResponsesInputItems([
      {
        entryKind: "user_prompt",
        promptText: "Run pwd",
        modelFacingPromptText: "Run pwd",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "pwd",
          commandDescription: "Print working directory",
        },
      },
      {
        entryKind: "completed_tool_result",
        toolCallId: "call_1",
        toolCallDetail: {
          toolName: "bash",
          commandLine: "pwd",
        },
        toolResultText: "Working directory: /tmp/demo",
      },
      {
        entryKind: "assistant_message",
        assistantMessageText: "Done.",
        providerTurnReplay: {
          provider: "openai",
          inputItems: [
            {
              type: "reasoning",
              id: "rs_1",
              encrypted_content: "encrypted-reasoning",
              summary: [{ type: "summary_text", text: "I should inspect the directory first." }],
            },
            {
              type: "function_call",
              id: "fc_1",
              call_id: "call_1",
              name: "bash",
              arguments: '{"command":"pwd","description":"Print working directory"}',
            },
            {
              type: "function_call_output",
              call_id: "call_1",
              output: "Working directory: /tmp/demo",
            },
          ],
        },
      },
    ]),
  ).toEqual([
    {
      role: "user",
      content: "Run pwd",
    },
    {
      type: "reasoning",
      id: "rs_1",
      encrypted_content: "encrypted-reasoning",
      summary: [{ type: "summary_text", text: "I should inspect the directory first." }],
    },
    {
      type: "function_call",
      id: "fc_1",
      call_id: "call_1",
      name: "bash",
      arguments: '{"command":"pwd","description":"Print working directory"}',
    },
    {
      type: "function_call_output",
      call_id: "call_1",
      output: "Working directory: /tmp/demo",
    },
    {
      role: "assistant",
      content: "Done.",
    },
  ]);
});

test("createOpenAiResponseReplayItems reconstructs reasoning, assistant text, and function calls from response output", () => {
  expect(
    createOpenAiResponseReplayItems([
      {
        type: "reasoning",
        id: "rs_1",
        encrypted_content: "encrypted-reasoning",
        summary: [{ type: "summary_text", text: "I should inspect the working directory first." }],
        status: null,
      },
      {
        type: "message",
        id: "msg_1",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "Running the command now." }],
      },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
        status: "completed",
      },
    ]),
  ).toEqual({
    continuationInputItems: [
      {
        type: "reasoning",
        id: "rs_1",
        encrypted_content: "encrypted-reasoning",
        summary: [{ type: "summary_text", text: "I should inspect the working directory first." }],
      },
      {
        role: "assistant",
        content: "Running the command now.",
      },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      },
    ],
    providerTurnReplayInputItems: [
      {
        type: "reasoning",
        id: "rs_1",
        encrypted_content: "encrypted-reasoning",
        summary: [{ type: "summary_text", text: "I should inspect the working directory first." }],
      },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      },
    ],
  });
});

test("createOpenAiResponsesInputItems falls back to assistant transcript text for legacy tool history without replay state", () => {
  expect(
    createOpenAiResponsesInputItems([
      {
        entryKind: "user_prompt",
        promptText: "Run pwd",
        modelFacingPromptText: "Run pwd",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "pwd",
          commandDescription: "Print working directory",
        },
      },
      {
        entryKind: "completed_tool_result",
        toolCallId: "call_1",
        toolCallDetail: {
          toolName: "bash",
          commandLine: "pwd",
        },
        toolResultText: "Working directory: /tmp/demo",
      },
      {
        entryKind: "assistant_message",
        assistantMessageText: "Done.",
      },
    ]),
  ).toEqual([
    {
      role: "user",
      content: "Run pwd",
    },
    {
      role: "assistant",
      content:
        "[assistant tool call call_1]\nTool: bash\nCommand: pwd\nDescription: Print working directory\n\n[assistant tool result call_1]\nWorking directory: /tmp/demo",
    },
    {
      role: "assistant",
      content: "Done.",
    },
  ]);
});
