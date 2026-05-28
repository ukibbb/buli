import { expect, test } from "bun:test";
import type { ConversationSessionEntry } from "@buli/contracts";
import {
  OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_PER_OUTPUT_MAX_CHARACTER_COUNT,
  OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_TURN_MAX_CHARACTER_COUNT,
  createOpenAiResponseReplayItems,
  createOpenAiResponsesInputItems,
} from "../src/provider/request.ts";

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

test("createOpenAiResponsesInputItems keeps paired tool side effects from failed assistant turns", () => {
  expect(
    createOpenAiResponsesInputItems([
      {
        entryKind: "user_prompt",
        promptText: "Write generated file",
        modelFacingPromptText: "Write generated file",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_write",
        toolCallRequest: {
          toolName: "write",
          writeTargetPath: "generated.txt",
          fileContent: "created\n",
        },
      },
      {
        entryKind: "completed_tool_result",
        toolCallId: "call_write",
        toolCallDetail: {
          toolName: "write",
          writtenFilePath: "generated.txt",
        },
        toolResultText: "Wrote generated.txt",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "failed",
        assistantMessageText: "Unsafe partial assistant text",
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
      content: "Write generated file",
    },
    {
      role: "assistant",
      content: [
        "[assistant tool call call_write]\nTool: write\nPath: generated.txt\nContent length: 8",
        "[assistant tool result call_write]\nWrote generated.txt",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: "Next prompt",
    },
  ]);
});

test("createOpenAiResponsesInputItems keeps paired tool side effects from interrupted assistant turns", () => {
  expect(
    createOpenAiResponsesInputItems([
      {
        entryKind: "user_prompt",
        promptText: "Run pwd",
        modelFacingPromptText: "Run pwd",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_bash",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "pwd",
          commandDescription: "Print working directory",
        },
      },
      {
        entryKind: "denied_tool_result",
        toolCallId: "call_bash",
        toolCallDetail: {
          toolName: "bash",
          commandLine: "pwd",
        },
        toolResultText: "The user denied this bash command, so it was not executed.",
        denialExplanation: "The user denied this bash command, so it was not executed.",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "interrupted",
        assistantMessageText: "Unsafe interrupted assistant text",
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
      content: "Run pwd",
    },
    {
      role: "assistant",
      content: [
        "[assistant tool call call_bash]\nTool: bash\nCommand: pwd\nDescription: Print working directory",
        "[assistant tool denial call_bash]\nThe user denied this bash command, so it was not executed.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: "Next prompt",
    },
  ]);
});

test("createOpenAiResponsesInputItems truncates large historical tool outputs from failed turns", () => {
  const largeHistoricalToolResultText = `start-${"x".repeat(OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_PER_OUTPUT_MAX_CHARACTER_COUNT)}-tail`;
  const projectedInputItems = createOpenAiResponsesInputItems([
    {
      entryKind: "user_prompt",
      promptText: "Read a large file",
      modelFacingPromptText: "Read a large file",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_read",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "large.txt",
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_read",
      toolCallDetail: {
        toolName: "read",
        readFilePath: "large.txt",
        readLineCount: 1,
      },
      toolResultText: largeHistoricalToolResultText,
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: "",
      failureExplanation: "Provider failed mid-turn",
    },
  ]);

  const assistantInputItem = projectedInputItems[1];
  if (!assistantInputItem || "type" in assistantInputItem || assistantInputItem.role !== "assistant") {
    throw new Error("Expected failed turn to project a historical assistant transcript.");
  }

  expect(assistantInputItem.content).toContain("start-");
  expect(assistantInputItem.content).not.toContain("-tail");
  expect(assistantInputItem.content).toContain(
    "[Historical tool result truncated for model context: omitted",
  );
});

test("createOpenAiResponsesInputItems applies a turn budget to failed historical tool transcripts", () => {
  const failedTurnToolEntries: ConversationSessionEntry[] = Array.from({ length: 24 }, (_value, index) => [
    {
      entryKind: "tool_call" as const,
      toolCallId: `call_read_${index}`,
      toolCallRequest: {
        toolName: "read" as const,
        readTargetPath: `file-${index}.txt`,
      },
    },
    {
      entryKind: "completed_tool_result" as const,
      toolCallId: `call_read_${index}`,
      toolCallDetail: {
        toolName: "read" as const,
        readFilePath: `file-${index}.txt`,
        readLineCount: 1,
      },
      toolResultText: `result-${index}-${"x".repeat(4_000)}-tail-${index}`,
    },
  ]).flat();

  const projectedInputItems = createOpenAiResponsesInputItems([
    {
      entryKind: "user_prompt",
      promptText: "Read many files",
      modelFacingPromptText: "Read many files",
    },
    ...failedTurnToolEntries,
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "interrupted",
      assistantMessageText: "",
      interruptionReason: "Interrupted by user.",
    },
  ]);

  const assistantInputItem = projectedInputItems[1];
  if (!assistantInputItem || "type" in assistantInputItem || assistantInputItem.role !== "assistant") {
    throw new Error("Expected interrupted turn to project a historical assistant transcript.");
  }

  expect(assistantInputItem.content.length).toBeLessThanOrEqual(
    OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_TURN_MAX_CHARACTER_COUNT,
  );
  expect(assistantInputItem.content).toContain("result-0-");
  expect(assistantInputItem.content).not.toContain("-tail-23");
  expect(assistantInputItem.content).toContain(
    "[Historical tool transcript truncated for model context: omitted",
  );
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
        retainedRecentConversationSessionEntryCount: 0,
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

test("createOpenAiResponsesInputItems ignores retained recent entries after compaction summary", () => {
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
        entryKind: "user_prompt",
        promptText: "Retained prompt",
        modelFacingPromptText: "Retained prompt",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Retained answer",
      },
      {
        entryKind: "conversation_compaction_summary",
        summaryText: "Goal: continue the compaction implementation.",
        compactedEntryCount: 2,
        retainedRecentConversationSessionEntryCount: 2,
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

test("createOpenAiResponsesInputItems keeps historical OpenAI tool replay out of future requests", () => {
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
      role: "assistant",
      content: "Done.",
    },
  ]);
});

test("createOpenAiResponsesInputItems preserves archived provider replay while omitting it from future requests", () => {
  const storedFunctionCallOutputText = `start-${"x".repeat(96_000)}-end`;
  const assistantMessageEntry: ConversationSessionEntry = {
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Done.",
    providerTurnReplay: {
      provider: "openai",
      inputItems: [
        {
          type: "function_call",
          id: "fc_1",
          call_id: "call_1",
          name: "bash",
          arguments: '{"command":"generate-output","description":"Generate output"}',
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: storedFunctionCallOutputText,
        },
      ],
    },
  };

  const projectedInputItems = createOpenAiResponsesInputItems([
    {
      entryKind: "user_prompt",
      promptText: "Generate output",
      modelFacingPromptText: "Generate output",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "generate-output",
        commandDescription: "Generate output",
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_1",
      toolCallDetail: {
        toolName: "bash",
        commandLine: "generate-output",
        commandDescription: "Generate output",
        exitCode: 0,
      },
      toolResultText: storedFunctionCallOutputText,
    },
    assistantMessageEntry,
  ]);

  expect(projectedInputItems.map((projectedInputItem) =>
    "type" in projectedInputItem ? projectedInputItem.type : projectedInputItem.role
  )).toEqual([
    "user",
    "assistant",
  ]);
  expect(projectedInputItems).toEqual([
    { role: "user", content: "Generate output" },
    { role: "assistant", content: "Done." },
  ]);
  const storedFunctionCallOutputItem = assistantMessageEntry.entryKind === "assistant_message"
    ? assistantMessageEntry.providerTurnReplay?.provider === "openai"
      ? assistantMessageEntry.providerTurnReplay.inputItems.find((providerTurnReplayInputItem) =>
        providerTurnReplayInputItem.type === "function_call_output"
      )
      : undefined
    : undefined;
  expect(storedFunctionCallOutputItem).toMatchObject(
    { type: "function_call_output", call_id: "call_1", output: storedFunctionCallOutputText },
  );
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

test("createOpenAiResponseReplayItems concatenates only valid assistant output text parts", () => {
  expect(
    createOpenAiResponseReplayItems([
      {
        type: "message",
        id: "msg_1",
        role: "assistant",
        content: [
          { type: "output_text", text: "Hello" },
          { type: "annotation", text: "ignored" },
          { type: "output_text", text: " world" },
          { type: "output_text", text: 42 },
          null,
        ],
      },
    ]),
  ).toEqual({
    continuationInputItems: [
      {
        role: "assistant",
        content: "Hello world",
      },
    ],
    providerTurnReplayInputItems: [],
  });
});

test("createOpenAiResponsesInputItems keeps legacy tool history out of completed future request context", () => {
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
      content: "Done.",
    },
  ]);
});

test("createOpenAiResponsesInputItems keeps segmented assistant text as terminal aggregate model context", () => {
  expect(
    createOpenAiResponsesInputItems([
      {
        entryKind: "user_prompt",
        promptText: "Inspect README",
        modelFacingPromptText: "Inspect README",
      },
      {
        entryKind: "assistant_text_segment",
        assistantTextSegmentText: "I will inspect README first.\n\n",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_read",
        toolCallRequest: {
          toolName: "read",
          readTargetPath: "README.md",
        },
      },
      {
        entryKind: "completed_tool_result",
        toolCallId: "call_read",
        toolCallDetail: {
          toolName: "read",
          readFilePath: "README.md",
          readLineCount: 2,
        },
        toolResultText: "1: # Demo",
      },
      {
        entryKind: "assistant_text_segment",
        assistantTextSegmentText: "README.md contains a Demo heading.",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "I will inspect README first.\n\nREADME.md contains a Demo heading.",
      },
    ]),
  ).toEqual([
    {
      role: "user",
      content: "Inspect README",
    },
    {
      role: "assistant",
      content: "I will inspect README first.\n\nREADME.md contains a Demo heading.",
    },
  ]);
});

test("createOpenAiResponsesInputItems keeps completed typed tool history out of future request context", () => {
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
        toolCallId: "call_task",
        toolCallRequest: {
          toolName: "task",
          subagentName: "explore",
          subagentDescription: "map contracts",
          subagentPrompt: "Inspect contracts and summarize tool request types.",
        },
      },
      {
        entryKind: "completed_tool_result",
        toolCallId: "call_task",
        toolCallDetail: {
          toolName: "task",
          subagentName: "explore",
          subagentDescription: "map contracts",
          subagentResultSummary: "contracts define typed tool requests",
        },
        toolResultText: "contracts define typed tool requests",
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
