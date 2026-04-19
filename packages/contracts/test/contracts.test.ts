import { expect, test } from "bun:test";
import {
  AssistantResponseEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  ConversationMessagePartSchema,
  ConversationMessageSchema,
  ConversationTurnStatusSchema,
  PendingToolApprovalRequestSchema,
} from "../src/index.ts";

test("ConversationMessageSchema parses a completed user message", () => {
  expect(
    ConversationMessageSchema.parse({
      id: "user-1",
      role: "user",
      messageStatus: "completed",
      createdAtMs: 1,
      partIds: ["part-1"],
    }),
  ).toEqual({
    id: "user-1",
    role: "user",
    messageStatus: "completed",
    createdAtMs: 1,
    partIds: ["part-1"],
  });
});

test("ConversationMessagePartSchema parses an assistant text part with an open streaming tail", () => {
  expect(
    ConversationMessagePartSchema.parse({
      id: "assistant-text-1",
      partKind: "assistant_text",
      partStatus: "streaming",
      rawMarkdownText: "Hello",
      completedContentParts: [],
      openContentPart: {
        kind: "streaming_markdown_text",
        text: "Hello",
      },
    }),
  ).toMatchObject({
    partKind: "assistant_text",
    partStatus: "streaming",
  });
});

test("AssistantToolCallConversationMessagePartSchema parses a denied tool call", () => {
  expect(
    AssistantToolCallConversationMessagePartSchema.parse({
      id: "tool-part-1",
      partKind: "assistant_tool_call",
      toolCallId: "call-1",
      toolCallStatus: "denied",
      toolCallStartedAtMs: 1,
      toolCallDetail: {
        toolName: "bash",
        commandLine: "rm -rf build",
      },
      denialText: "The user denied this bash command, so it was not executed.",
    }).toolCallStatus,
  ).toBe("denied");
});

test("PendingToolApprovalRequestSchema parses the dedicated approval model", () => {
  expect(
    PendingToolApprovalRequestSchema.parse({
      approvalId: "approval-1",
      pendingToolCallId: "call-1",
      pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      riskExplanation: "This bash command will run inside the current workspace.",
    }).approvalId,
  ).toBe("approval-1");
});

test("AssistantResponseEventSchema parses assistant_message_part_added", () => {
  expect(
    AssistantResponseEventSchema.parse({
      type: "assistant_message_part_added",
      messageId: "assistant-1",
      part: {
        id: "plan-part-1",
        partKind: "assistant_plan_proposal",
        planId: "plan-1",
        planTitle: "Inspect the codebase",
        planSteps: [{ stepIndex: 0, stepTitle: "Read files", stepStatus: "pending" }],
      },
    }).type,
  ).toBe("assistant_message_part_added");
});

test("AssistantResponseEventSchema parses assistant_message_failed", () => {
  expect(
    AssistantResponseEventSchema.parse({
      type: "assistant_message_failed",
      messageId: "assistant-1",
      errorText: "Provider stream ended before completion",
    }).type,
  ).toBe("assistant_message_failed");
});

test("ConversationTurnStatusSchema parses waiting_for_tool_approval", () => {
  expect(ConversationTurnStatusSchema.parse("waiting_for_tool_approval")).toBe("waiting_for_tool_approval");
});
