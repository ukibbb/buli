import { expect, test } from "bun:test";
import type { ProviderTurnReplay } from "@buli/contracts";
import {
  AssistantToolRegistry,
  InMemoryConversationHistory,
  type CustomAssistantToolDefinition,
  type ProviderConversationTurn,
} from "../src/index.ts";
import { streamAssistantResponseEventsForCustomToolCall } from "../src/runtimeCustomToolCallExecution.ts";
import { RuntimeToolResultSessionRecorder } from "../src/runtimeToolResultSessionRecorder.ts";
import { RuntimeProviderTurnToolResultRetentionRegistry } from "../src/runtimeProviderTurnToolResultRetention.ts";

class RecordingProviderConversationTurn implements ProviderConversationTurn {
  readonly submittedToolResults: Array<{ toolCallId: string; toolResultText: string }> = [];

  async *streamProviderEvents(): AsyncGenerator<never> {}

  async submitToolResult(input: { toolCallId: string; toolResultText: string }): Promise<void> {
    this.submittedToolResults.push(input);
  }

  getProviderTurnReplay(): ProviderTurnReplay | undefined {
    return undefined;
  }
}

function createCustomRuntimeTestTool(): CustomAssistantToolDefinition {
  return {
    toolName: "workspace_summary",
    providerToolDefinition: {
      toolName: "workspace_summary",
      description: "Summarize a workspace topic.",
      parameters: {
        type: "object",
        properties: { topic: { type: "string" } },
        required: ["topic"],
        additionalProperties: false,
      },
    },
    executionPolicy: {
      workspaceEffectKind: "read_only",
      isAutoConcurrent: false,
      isAutoApprovedReadOnly: false,
      clearsSameTurnReadCoverageBeforeExecution: false,
    },
    executor: async (input) => {
      const topic = input.toolCallRequest.toolArgumentsJson["topic"];
      const topicText = typeof topic === "string" ? topic : "unknown topic";
      return {
        outcomeKind: "completed",
        toolResultText: `Summary for ${topicText}`,
        toolResultJson: { topic: topicText, fileCount: 3 },
        toolResultSummary: `Summarized ${topicText}`,
        toolCallDetail: {
          toolName: "workspace_summary",
          toolDisplayName: "Workspace Summary",
        },
      };
    },
  };
}

test("streamAssistantResponseEventsForCustomToolCall records and submits completed custom tool results", async () => {
  const customTool = createCustomRuntimeTestTool();
  const assistantToolRegistry = new AssistantToolRegistry({ customTools: [customTool] });
  const conversationHistory = new InMemoryConversationHistory();
  const providerConversationTurn = new RecordingProviderConversationTurn();
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({
    conversationTurnId: "turn-custom-1",
    conversationHistory,
  });
  const abortController = new AbortController();
  const assistantResponseEvents = [];

  for await (
    const assistantResponseEvent of streamAssistantResponseEventsForCustomToolCall({
      assistantResponseMessageId: "assistant-message-1",
      providerConversationTurn,
      conversationTurnId: "turn-custom-1",
      toolCallId: "call-custom-1",
      customToolCallRequest: {
        toolName: "workspace_summary",
        toolArgumentsJson: { topic: "runtime" },
      },
      assistantToolRegistry,
      workspaceRootPath: "/workspace",
      toolResultSessionRecorder,
      abortSignal: abortController.signal,
      createPendingToolApproval: () => {
        throw new Error("auto-approved custom tool should not request approval");
      },
      throwIfConversationTurnInterrupted: () => {},
    })
  ) {
    assistantResponseEvents.push(assistantResponseEvent);
  }

  expect(assistantResponseEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_message_part_added",
    "assistant_message_part_updated",
  ]);
  expect(providerConversationTurn.submittedToolResults).toEqual([
    { toolCallId: "call-custom-1", toolResultText: "Summary for runtime" },
  ]);
  expect(conversationHistory.conversationSessionEntries).toEqual([
    {
      entryKind: "completed_tool_result",
      toolCallId: "call-custom-1",
      toolCallDetail: {
        toolName: "workspace_summary",
        toolDisplayName: "Workspace Summary",
        toolArgumentsJson: { topic: "runtime" },
        toolResultJson: { topic: "runtime", fileCount: 3 },
        toolResultSummary: "Summarized runtime",
      },
      toolResultText: "Summary for runtime",
    },
  ]);
});

test("streamAssistantResponseEventsForCustomToolCall submits full result while persisting retained result", async () => {
  const assistantToolRegistry = new AssistantToolRegistry({
    customTools: [{
      ...createCustomRuntimeTestTool(),
      executor: async () => ({
        outcomeKind: "completed",
        toolResultText: "Full private MCP note body",
        toolResultJson: { body: "Full private MCP note body" },
        toolResultSummary: "Private note summary",
        toolCallDetail: {
          toolName: "workspace_summary",
          toolDisplayName: "Workspace Summary",
          toolResultJson: { body: "Full private MCP note body" },
          toolResultSummary: "Private note summary",
        },
        sessionToolResultText: "MCP result retained as summary only.",
        sessionToolCallDetail: {
          toolName: "workspace_summary",
          toolDisplayName: "Workspace Summary",
          toolResultSummary: "Private note summary",
        },
      }),
    }],
  });
  const conversationHistory = new InMemoryConversationHistory();
  const providerConversationTurn = new RecordingProviderConversationTurn();
  const toolResultRetentionRegistry = new RuntimeProviderTurnToolResultRetentionRegistry();
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({
    conversationTurnId: "turn-custom-retained",
    conversationHistory,
  });
  const assistantResponseEvents = [];

  for await (
    const assistantResponseEvent of streamAssistantResponseEventsForCustomToolCall({
      assistantResponseMessageId: "assistant-message-retained",
      providerConversationTurn,
      conversationTurnId: "turn-custom-retained",
      toolCallId: "call-custom-retained",
      customToolCallRequest: {
        toolName: "workspace_summary",
        toolArgumentsJson: { topic: "privacy" },
      },
      assistantToolRegistry,
      workspaceRootPath: "/workspace",
      toolResultSessionRecorder,
      toolResultRetentionRegistry,
      abortSignal: new AbortController().signal,
      createPendingToolApproval: () => {
        throw new Error("auto-approved custom tool should not request approval");
      },
      throwIfConversationTurnInterrupted: () => {},
    })
  ) {
    assistantResponseEvents.push(assistantResponseEvent);
  }

  expect(assistantResponseEvents).toHaveLength(2);
  expect(providerConversationTurn.submittedToolResults).toEqual([
    { toolCallId: "call-custom-retained", toolResultText: "Full private MCP note body" },
  ]);
  expect(conversationHistory.conversationSessionEntries).toEqual([
    {
      entryKind: "completed_tool_result",
      toolCallId: "call-custom-retained",
      toolCallDetail: {
        toolName: "workspace_summary",
        toolDisplayName: "Workspace Summary",
        toolArgumentsJson: { topic: "privacy" },
        toolResultSummary: "Private note summary",
      },
      toolResultText: "MCP result retained as summary only.",
    },
  ]);
  expect(toolResultRetentionRegistry.readRetainedToolResultText("call-custom-retained")).toBe(
    "MCP result retained as summary only.",
  );
});
