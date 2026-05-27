import { expect, test } from "bun:test";
import type {
  AssistantMessageConversationSessionEntry,
  ConversationSessionEntry,
  OpenAiProviderTurnReplayInputItem,
} from "@buli/contracts";
import {
  OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_MAX_CHARACTER_COUNT,
  OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_TURN_MAX_CHARACTER_COUNT,
  createOpenAiResponseReplayItems,
  createOpenAiResponsesInputItems,
} from "../src/provider/request.ts";
import type { OpenAiFunctionCallOutputInputItem } from "../src/provider/request.ts";

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

test("createOpenAiResponsesInputItems keeps historical tool outputs below the aggregate turn budget full", () => {
  const storedFunctionCallOutputText = `read-start-${"x".repeat(12_000)}-read-end`;
  const projectedInputItems = createOpenAiResponsesInputItems([
    {
      entryKind: "user_prompt",
      promptText: "Read file",
      modelFacingPromptText: "Read file",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_read_small",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "README.md",
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_read_small",
      toolCallDetail: {
        toolName: "read",
        readFilePath: "README.md",
      },
      toolResultText: storedFunctionCallOutputText,
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Done.",
      providerTurnReplay: {
        provider: "openai",
        inputItems: [
          {
            type: "function_call",
            id: "fc_read_small",
            call_id: "call_read_small",
            name: "read",
            arguments: '{"filePath":"README.md"}',
          },
          {
            type: "function_call_output",
            call_id: "call_read_small",
            output: storedFunctionCallOutputText,
          },
        ],
      },
    },
  ]);

  const projectedFunctionCallOutputItem = projectedInputItems.find(
    (projectedInputItem): projectedInputItem is OpenAiFunctionCallOutputInputItem =>
      "type" in projectedInputItem && projectedInputItem.type === "function_call_output",
  );

  expect(projectedFunctionCallOutputItem?.output).toBe(storedFunctionCallOutputText);
});

test("createOpenAiResponsesInputItems budgets historical tool outputs at request projection without mutating stored replay", () => {
  const storedFunctionCallOutputText = `start-${"x".repeat(96_000)}-end`;
  const assistantMessageEntry = {
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
  } satisfies AssistantMessageConversationSessionEntry;

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

  const projectedFunctionCallOutputItem = projectedInputItems.find(
    (projectedInputItem): projectedInputItem is OpenAiFunctionCallOutputInputItem =>
      "type" in projectedInputItem && projectedInputItem.type === "function_call_output",
  );

  expect(projectedInputItems.map((projectedInputItem) =>
    "type" in projectedInputItem ? projectedInputItem.type : projectedInputItem.role
  )).toEqual([
    "user",
    "function_call",
    "function_call_output",
    "assistant",
  ]);
  expect(projectedFunctionCallOutputItem).toBeDefined();
  expect(projectedFunctionCallOutputItem?.output).not.toBe(storedFunctionCallOutputText);
  expect(projectedFunctionCallOutputItem?.output.length).toBeLessThanOrEqual(
    OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_MAX_CHARACTER_COUNT,
  );
  expect(projectedFunctionCallOutputItem?.output.startsWith("start-")).toBe(true);
  expect(projectedFunctionCallOutputItem?.output).toContain("Historical tool output was truncated only for this future request projection.");
  expect(projectedFunctionCallOutputItem?.output).toContain("omitted content is not currently visible in this request");
  expect(projectedFunctionCallOutputItem?.output).toContain("sourceToolCallId: call_1");
  expect(projectedFunctionCallOutputItem?.output).toContain("toolName: bash");
  expect(projectedFunctionCallOutputItem?.output).toContain("toolResultEntryKind: completed_tool_result");
  expect(projectedFunctionCallOutputItem?.output).toContain(`originalCharacterCount: ${storedFunctionCallOutputText.length}`);
  expect(projectedFunctionCallOutputItem?.output).toContain(
    `projectedCharacterBudget: ${OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_MAX_CHARACTER_COUNT}`,
  );
  expect(projectedFunctionCallOutputItem?.output).toContain("Do not rely on omitted content; request a narrower follow-up tool call if those details are needed.");
  expect(projectedFunctionCallOutputItem?.output.endsWith("-end")).toBe(true);
  const storedFunctionCallOutputItem = assistantMessageEntry.providerTurnReplay.inputItems.find(
    (providerTurnReplayInputItem): providerTurnReplayInputItem is OpenAiFunctionCallOutputInputItem =>
      providerTurnReplayInputItem.type === "function_call_output",
  );
  expect(storedFunctionCallOutputItem?.output).toBe(storedFunctionCallOutputText);
});

test("createOpenAiResponsesInputItems budgets historical read outputs with an explicit projection marker", () => {
  const storedFunctionCallOutputText = `read-start-${"x".repeat(96_000)}-read-end`;
  const projectedInputItems = createOpenAiResponsesInputItems([
    {
      entryKind: "user_prompt",
      promptText: "Read file",
      modelFacingPromptText: "Read file",
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
      },
      toolResultText: storedFunctionCallOutputText,
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Done.",
      providerTurnReplay: {
        provider: "openai",
        inputItems: [
          {
            type: "function_call",
            id: "fc_read",
            call_id: "call_read",
            name: "read",
            arguments: '{"filePath":"README.md"}',
          },
          {
            type: "function_call_output",
            call_id: "call_read",
            output: storedFunctionCallOutputText,
          },
        ],
      },
    },
  ]);

  const projectedFunctionCallOutputItem = projectedInputItems.find(
    (projectedInputItem): projectedInputItem is OpenAiFunctionCallOutputInputItem =>
      "type" in projectedInputItem && projectedInputItem.type === "function_call_output",
  );

  expect(projectedFunctionCallOutputItem?.output).not.toBe(storedFunctionCallOutputText);
  expect(projectedFunctionCallOutputItem?.output.length).toBeLessThanOrEqual(
    OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_MAX_CHARACTER_COUNT,
  );
  expect(projectedFunctionCallOutputItem?.output.startsWith("read-start-")).toBe(true);
  expect(projectedFunctionCallOutputItem?.output).toContain("omitted content is not currently visible in this request");
  expect(projectedFunctionCallOutputItem?.output).toContain("sourceToolCallId: call_read");
  expect(projectedFunctionCallOutputItem?.output).toContain("toolName: read");
  expect(projectedFunctionCallOutputItem?.output.endsWith("-read-end")).toBe(true);
});

test("createOpenAiResponsesInputItems budgets non-zero historical bash outputs with an explicit projection marker", () => {
  const storedFunctionCallOutputText = `nonzero-start-${"x".repeat(96_000)}-nonzero-end`;
  const projectedInputItems = createOpenAiResponsesInputItems([
    {
      entryKind: "user_prompt",
      promptText: "Run failing command",
      modelFacingPromptText: "Run failing command",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_bash",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "generate-failure",
        commandDescription: "Generate failure",
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_bash",
      toolCallDetail: {
        toolName: "bash",
        commandLine: "generate-failure",
        commandDescription: "Generate failure",
        exitCode: 1,
      },
      toolResultText: storedFunctionCallOutputText,
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Done.",
      providerTurnReplay: {
        provider: "openai",
        inputItems: [
          {
            type: "function_call",
            id: "fc_bash",
            call_id: "call_bash",
            name: "bash",
            arguments: '{"command":"generate-failure","description":"Generate failure"}',
          },
          {
            type: "function_call_output",
            call_id: "call_bash",
            output: storedFunctionCallOutputText,
          },
        ],
      },
    },
  ]);

  const projectedFunctionCallOutputItem = projectedInputItems.find(
    (projectedInputItem): projectedInputItem is OpenAiFunctionCallOutputInputItem =>
      "type" in projectedInputItem && projectedInputItem.type === "function_call_output",
  );

  expect(projectedFunctionCallOutputItem?.output).not.toBe(storedFunctionCallOutputText);
  expect(projectedFunctionCallOutputItem?.output.length).toBeLessThanOrEqual(
    OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_MAX_CHARACTER_COUNT,
  );
  expect(projectedFunctionCallOutputItem?.output.startsWith("nonzero-start-")).toBe(true);
  expect(projectedFunctionCallOutputItem?.output).toContain("omitted content is not currently visible in this request");
  expect(projectedFunctionCallOutputItem?.output).toContain("sourceToolCallId: call_bash");
  expect(projectedFunctionCallOutputItem?.output).toContain("toolName: bash");
  expect(projectedFunctionCallOutputItem?.output).toContain("toolResultEntryKind: completed_tool_result");
  expect(projectedFunctionCallOutputItem?.output.endsWith("-nonzero-end")).toBe(true);
});

test("createOpenAiResponsesInputItems budgets failed historical bash outputs with an explicit projection marker", () => {
  const storedFunctionCallOutputText = `failed-start-${"x".repeat(96_000)}-failed-end`;
  const projectedInputItems = createOpenAiResponsesInputItems([
    {
      entryKind: "user_prompt",
      promptText: "Run command",
      modelFacingPromptText: "Run command",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_failed_bash",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "generate-error",
        commandDescription: "Generate error",
      },
    },
    {
      entryKind: "failed_tool_result",
      toolCallId: "call_failed_bash",
      toolCallDetail: {
        toolName: "bash",
        commandLine: "generate-error",
        commandDescription: "Generate error",
      },
      toolResultText: storedFunctionCallOutputText,
      failureExplanation: "executor failed",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Done.",
      providerTurnReplay: {
        provider: "openai",
        inputItems: [
          {
            type: "function_call",
            id: "fc_failed_bash",
            call_id: "call_failed_bash",
            name: "bash",
            arguments: '{"command":"generate-error","description":"Generate error"}',
          },
          {
            type: "function_call_output",
            call_id: "call_failed_bash",
            output: storedFunctionCallOutputText,
          },
        ],
      },
    },
  ]);

  const projectedFunctionCallOutputItem = projectedInputItems.find(
    (projectedInputItem): projectedInputItem is OpenAiFunctionCallOutputInputItem =>
      "type" in projectedInputItem && projectedInputItem.type === "function_call_output",
  );

  expect(projectedFunctionCallOutputItem?.output).not.toBe(storedFunctionCallOutputText);
  expect(projectedFunctionCallOutputItem?.output.length).toBeLessThanOrEqual(
    OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_MAX_CHARACTER_COUNT,
  );
  expect(projectedFunctionCallOutputItem?.output.startsWith("failed-start-")).toBe(true);
  expect(projectedFunctionCallOutputItem?.output).toContain("omitted content is not currently visible in this request");
  expect(projectedFunctionCallOutputItem?.output).toContain("sourceToolCallId: call_failed_bash");
  expect(projectedFunctionCallOutputItem?.output).toContain("toolName: bash");
  expect(projectedFunctionCallOutputItem?.output).toContain("toolResultEntryKind: failed_tool_result");
  expect(projectedFunctionCallOutputItem?.output.endsWith("-failed-end")).toBe(true);
});

test("createOpenAiResponsesInputItems keeps aggregate historical replay projection within the turn budget", () => {
  const readOutputText = `read-start-${"r".repeat(16_000)}-read-end`;
  const failedBashOutputText = `failed-start-${"f".repeat(16_000)}-failed-end`;
  const readToolSessionEntries = Array.from({ length: 8 }, (_, readIndex): ConversationSessionEntry[] => [
    {
      entryKind: "tool_call",
      toolCallId: `call_read_${readIndex}`,
      toolCallRequest: {
        toolName: "read",
        readTargetPath: `file-${readIndex}.ts`,
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: `call_read_${readIndex}`,
      toolCallDetail: {
        toolName: "read",
        readFilePath: `file-${readIndex}.ts`,
      },
      toolResultText: readOutputText,
    },
  ]).flat();
  const readReplayInputItems = Array.from({ length: 8 }, (_, readIndex): OpenAiProviderTurnReplayInputItem[] => [
    {
      type: "function_call",
      id: `fc_read_${readIndex}`,
      call_id: `call_read_${readIndex}`,
      name: "read",
      arguments: JSON.stringify({ filePath: `file-${readIndex}.ts` }),
    },
    {
      type: "function_call_output",
      call_id: `call_read_${readIndex}`,
      output: readOutputText,
    },
  ]).flat();
  const assistantMessageEntry = {
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Done.",
    providerTurnReplay: {
      provider: "openai",
      inputItems: [
        ...readReplayInputItems,
        {
          type: "function_call",
          id: "fc_failed_bash",
          call_id: "call_failed_bash",
          name: "bash",
          arguments: '{"command":"generate-error","description":"Generate error"}',
        },
        {
          type: "function_call_output",
          call_id: "call_failed_bash",
          output: failedBashOutputText,
        },
      ],
    },
  } satisfies AssistantMessageConversationSessionEntry;
  const projectedInputItems = createOpenAiResponsesInputItems([
    {
      entryKind: "user_prompt",
      promptText: "Inspect many outputs",
      modelFacingPromptText: "Inspect many outputs",
    },
    ...readToolSessionEntries,
    {
      entryKind: "tool_call",
      toolCallId: "call_failed_bash",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "generate-error",
        commandDescription: "Generate error",
      },
    },
    {
      entryKind: "failed_tool_result",
      toolCallId: "call_failed_bash",
      toolCallDetail: {
        toolName: "bash",
        commandLine: "generate-error",
        commandDescription: "Generate error",
      },
      toolResultText: failedBashOutputText,
      failureExplanation: "executor failed",
    },
    assistantMessageEntry,
  ]);

  const projectedFunctionCallOutputItems = projectedInputItems.filter(
    (projectedInputItem): projectedInputItem is OpenAiFunctionCallOutputInputItem =>
      "type" in projectedInputItem && projectedInputItem.type === "function_call_output",
  );
  const projectedOutputTextLength = projectedFunctionCallOutputItems.reduce(
    (totalTextLength, projectedFunctionCallOutputItem) => totalTextLength + projectedFunctionCallOutputItem.output.length,
    0,
  );
  const firstProjectedReadOutput = projectedFunctionCallOutputItems.find((projectedFunctionCallOutputItem) =>
    projectedFunctionCallOutputItem.call_id === "call_read_0"
  );
  const projectedFailedBashOutput = projectedFunctionCallOutputItems.find((projectedFunctionCallOutputItem) =>
    projectedFunctionCallOutputItem.call_id === "call_failed_bash"
  );

  expect(projectedOutputTextLength).toBeLessThanOrEqual(OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_TURN_MAX_CHARACTER_COUNT);
  expect(firstProjectedReadOutput).toBeDefined();
  expect(projectedFailedBashOutput).toBeDefined();
  if (!firstProjectedReadOutput || !projectedFailedBashOutput) {
    throw new Error("Expected projected read and failed bash outputs to be present.");
  }
  expect(projectedFailedBashOutput.output.length).toBeGreaterThan(firstProjectedReadOutput.output.length);
  expect(firstProjectedReadOutput.output).toContain("omitted content is not currently visible in this request");
  expect(projectedFailedBashOutput.output).toContain("toolResultEntryKind: failed_tool_result");
  expect(assistantMessageEntry.providerTurnReplay.inputItems.at(-1)).toEqual({
    type: "function_call_output",
    call_id: "call_failed_bash",
    output: failedBashOutputText,
  });
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
      content: "[assistant tool call call_read]\nTool: read\nPath: README.md\n\n[assistant tool result call_read]\n1: # Demo",
    },
    {
      role: "assistant",
      content: "I will inspect README first.\n\nREADME.md contains a Demo heading.",
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
      content: [
        "[assistant tool call call_read]\nTool: read\nPath: README.md\nOffset line: 2\nLine limit: 5",
        "[assistant tool result call_read]\n2: docs",
        "[assistant tool call call_glob]\nTool: glob\nPattern: **/*.ts\nDirectory: packages",
        "[assistant tool result call_glob]\npackages/contracts/src/index.ts",
        "[assistant tool call call_grep]\nTool: grep\nPattern: ToolCallRequest\nPath: packages\nInclude: *.ts",
        "[assistant tool failure call_grep]\nGrep failed: invalid regex",
        "[assistant tool call call_task]\nTool: task\nSubagent: explore\nDescription: map contracts\nPrompt: Inspect contracts and summarize tool request types.",
        "[assistant tool result call_task]\ncontracts define typed tool requests",
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
