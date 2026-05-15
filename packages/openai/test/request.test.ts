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
        assistantMessageStatus: "completed",
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

test("createOpenAiResponsesInputItems serializes user prompt image attachments as Responses image input", () => {
  expect(
    createOpenAiResponsesInputItems([
      {
        entryKind: "user_prompt",
        promptText: "What is in this image?",
        modelFacingPromptText: "What is in this image?",
        imageAttachments: [
          {
            attachmentId: "image-1",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,aGVsbG8=",
          },
        ],
      },
    ]),
  ).toEqual([
    {
      role: "user",
      content: [
        { type: "input_text", text: "What is in this image?" },
        { type: "input_image", image_url: "data:image/png;base64,aGVsbG8=" },
      ],
    },
  ]);
});

test("createOpenAiResponsesInputItems serializes incomplete assistant turns as model context", () => {
  expect(
    createOpenAiResponsesInputItems([
      {
        entryKind: "user_prompt",
        promptText: "Continue until the limit",
        modelFacingPromptText: "Continue until the limit",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "incomplete",
        assistantMessageText: "Partial answer",
        incompleteReason: "max_output_tokens",
      },
      {
        entryKind: "user_prompt",
        promptText: "Next prompt",
        modelFacingPromptText: "Next prompt",
      },
    ]),
  ).toEqual([
    {
      role: "user",
      content: "Continue until the limit",
    },
    {
      role: "assistant",
      content: "Partial answer",
    },
    {
      role: "user",
      content: "Next prompt",
    },
  ]);
});

test("createOpenAiResponsesInputItems skips failed assistant turns", () => {
  expect(
    createOpenAiResponsesInputItems([
      {
        entryKind: "user_prompt",
        promptText: "Failed prompt",
        modelFacingPromptText: "Failed prompt",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "failed",
        assistantMessageText: "Partial unsafe answer",
        failureExplanation: "Provider failed mid-turn",
      },
      {
        entryKind: "user_prompt",
        promptText: "Next prompt",
        modelFacingPromptText: "Next prompt",
      },
    ]),
  ).toEqual([
    {
      role: "user",
      content: "Next prompt",
    },
  ]);
});

test("createOpenAiResponsesInputItems skips interrupted assistant turns", () => {
  expect(
    createOpenAiResponsesInputItems([
      {
        entryKind: "user_prompt",
        promptText: "Interrupted prompt",
        modelFacingPromptText: "Interrupted prompt",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "interrupted",
        assistantMessageText: "Partial answer",
        interruptionReason: "Interrupted by user.",
      },
      {
        entryKind: "user_prompt",
        promptText: "Next prompt",
        modelFacingPromptText: "Next prompt",
      },
    ]),
  ).toEqual([
    {
      role: "user",
      content: "Next prompt",
    },
  ]);
});

test("createOpenAiResponsesInputItems starts at the latest compaction summary", () => {
  expect(
    createOpenAiResponsesInputItems([
      {
        entryKind: "user_prompt",
        promptText: "Old prompt",
        modelFacingPromptText: "Old prompt",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Old answer",
      },
      {
        entryKind: "conversation_compaction_summary",
        summaryText: "Goal: continue the compaction implementation.",
        compactedEntryCount: 2,
      },
      {
        entryKind: "user_prompt",
        promptText: "Next prompt",
        modelFacingPromptText: "Next prompt",
      },
    ]),
  ).toEqual([
    {
      role: "user",
      content: [
        "<conversation_compaction_summary>",
        "The earlier conversation was compacted. Continue from this summary:",
        "",
        "Goal: continue the compaction implementation.",
        "</conversation_compaction_summary>",
      ].join("\n"),
    },
    {
      role: "user",
      content: "Next prompt",
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
        assistantMessageStatus: "completed",
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
        assistantMessageStatus: "completed",
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

test("createOpenAiResponsesInputItems includes typed tools in legacy transcript fallback", () => {
  expect(
    createOpenAiResponsesInputItems([
      {
        entryKind: "user_prompt",
        promptText: "Inspect files",
        modelFacingPromptText: "Inspect files",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_read",
        toolCallRequest: {
          toolName: "read",
          readTargetPath: "README.md",
          offsetLineNumber: 2,
          maximumLineCount: 5,
        },
      },
      {
        entryKind: "completed_tool_result",
        toolCallId: "call_read",
        toolCallDetail: {
          toolName: "read",
          readFilePath: "README.md",
          readLineCount: 10,
        },
        toolResultText: "2: docs",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_glob",
        toolCallRequest: {
          toolName: "glob",
          globPattern: "**/*.ts",
          searchDirectoryPath: "packages",
        },
      },
      {
        entryKind: "completed_tool_result",
        toolCallId: "call_glob",
        toolCallDetail: {
          toolName: "glob",
          globPattern: "**/*.ts",
          matchedPathCount: 1,
        },
        toolResultText: "packages/contracts/src/index.ts",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_grep",
        toolCallRequest: {
          toolName: "grep",
          regexPattern: "ToolCallRequest",
          searchPath: "packages",
          includeGlobPattern: "*.ts",
        },
      },
      {
        entryKind: "failed_tool_result",
        toolCallId: "call_grep",
        toolCallDetail: {
          toolName: "grep",
          searchPattern: "ToolCallRequest",
        },
        toolResultText: "Grep failed: invalid regex",
        failureExplanation: "invalid regex",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_explore",
        toolCallRequest: {
          toolName: "explore",
          explorationDescription: "map runtime",
          explorationPrompt: "Inspect runtime and tool execution flow.",
        },
      },
      {
        entryKind: "completed_tool_result",
        toolCallId: "call_explore",
        toolCallDetail: {
          toolName: "explore",
          explorationDescription: "map runtime",
          explorationResultSummary: "runtime.ts dispatches requested tools through runtimeToolCallExecution.ts",
        },
        toolResultText: "runtime.ts dispatches requested tools through runtimeToolCallExecution.ts",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Done.",
      },
    ]),
  ).toEqual([
    {
      role: "user",
      content: "Inspect files",
    },
    {
      role: "assistant",
      content: [
        "[assistant tool call call_read]\nTool: read\nPath: README.md\nOffset line: 2\nLine limit: 5",
        "[assistant tool result call_read]\n2: docs",
        "[assistant tool call call_glob]\nTool: glob\nPattern: **/*.ts\nDirectory: packages",
        "[assistant tool result call_glob]\npackages/contracts/src/index.ts",
        "[assistant tool call call_grep]\nTool: grep\nPattern: ToolCallRequest\nPath: packages\nInclude: *.ts",
        "[assistant tool failure call_grep]\nGrep failed: invalid regex",
        "[assistant tool call call_explore]\nTool: explore\nDescription: map runtime\nPrompt: Inspect runtime and tool execution flow.",
        "[assistant tool result call_explore]\nruntime.ts dispatches requested tools through runtimeToolCallExecution.ts",
      ].join("\n\n"),
    },
    {
      role: "assistant",
      content: "Done.",
    },
  ]);
});

test("createOpenAiResponsesInputItems ignores dangling legacy tool calls", () => {
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
        entryKind: "user_prompt",
        promptText: "Next prompt",
        modelFacingPromptText: "Next prompt",
      },
    ]),
  ).toEqual([
    {
      role: "user",
      content: "Next prompt",
    },
  ]);
});
