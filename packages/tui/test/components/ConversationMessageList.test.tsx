import { describe, expect, test } from "bun:test";
import type { ConversationMessage, ConversationMessagePart, WorkspacePatch } from "@buli/contracts";
import type { ScrollBoxRenderable } from "@opentui/core";
import { testRender } from "../testRenderWithCleanup.ts";
import { ConversationMessageList } from "../../src/components/ConversationMessageList.tsx";

function createSingleFileWorkspacePatch(input: {
  toolCallId: string;
  filePath: string;
  addedLineCount: number;
  removedLineCount: number;
  unifiedDiffText?: string;
}): WorkspacePatch {
  return {
    workspacePatchId: `patch-${input.toolCallId}`,
    toolCallId: input.toolCallId,
    capturedAtMs: 10,
    baselineSnapshotHash: "before-tree",
    resultingSnapshotHash: "after-tree",
    changedFileCount: 1,
    addedLineCount: input.addedLineCount,
    removedLineCount: input.removedLineCount,
    changedFiles: [
      {
        filePath: input.filePath,
        changeKind: "modified",
        addedLineCount: input.addedLineCount,
        removedLineCount: input.removedLineCount,
        ...(input.unifiedDiffText !== undefined ? { unifiedDiffText: input.unifiedDiffText } : {}),
      },
    ],
  };
}

describe("ConversationMessageList", () => {
  test("renders Thinking for an empty streaming assistant message", async () => {
    const conversationMessages: ConversationMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        messageStatus: "streaming",
        createdAtMs: Date.now() - 1000,
        partIds: [],
      },
    ];

    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationMessageList
        conversationMessages={conversationMessages}
        isReasoningSummaryVisible={true}
        resolveConversationMessageParts={() => []}
        conversationMessageScrollBoxRef={{ current: null }}
        horizontalRuleColor="#10B981"
        userMessageBorderColor="#10B981"
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("◆");
    expect(frame).toContain("Thinking");
  });

  test("renders user, reasoning, assistant text, tool call, and turn summary parts", async () => {
    const conversationMessages: ConversationMessage[] = [
      {
        id: "user-1",
        role: "user",
        messageStatus: "completed",
        createdAtMs: 1,
        partIds: ["user-text-1"],
      },
      {
        id: "assistant-1",
        role: "assistant",
        messageStatus: "completed",
        createdAtMs: 2,
        partIds: ["reasoning-1", "assistant-text-1", "tool-1", "summary-1"],
      },
    ];
    const conversationMessagePartsByMessageId: Record<string, ConversationMessagePart[]> = {
      "user-1": [{ id: "user-text-1", partKind: "user_text", text: "Inspect the repo" }],
      "assistant-1": [
        {
          id: "reasoning-1",
          partKind: "assistant_reasoning",
          partStatus: "completed",
          reasoningSummaryText: "Thinking through the repo layout.",
          reasoningStartedAtMs: 2,
          reasoningDurationMs: 800,
          reasoningTokenCount: 12,
        },
        {
          id: "assistant-text-1",
          partKind: "assistant_text",
          partStatus: "completed",
          rawMarkdownText: "# Done",
        },
        {
          id: "tool-1",
          partKind: "assistant_tool_call",
          toolCallId: "call-1",
          toolCallStatus: "completed",
          toolCallStartedAtMs: 2,
          toolCallDetail: { toolName: "read", readFilePath: "src/index.ts", readLineCount: 4 },
          durationMs: 20,
        },
        {
          id: "summary-1",
          partKind: "assistant_turn_summary",
          turnDurationMs: 1500,
          modelDisplayName: "gpt-5.4",
          usage: { total: 100, input: 60, output: 30, reasoning: 10, cache: { read: 5, write: 0 } },
        },
      ],
    };
    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationMessageList
        conversationMessages={conversationMessages}
        isReasoningSummaryVisible={true}
        resolveConversationMessageParts={(messageId) => conversationMessagePartsByMessageId[messageId] ?? []}
        conversationMessageScrollBoxRef={{ current: null }}
        horizontalRuleColor="#10B981"
        userMessageBorderColor="#10B981"
      />,
      { width: 100, height: 24 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Inspect the repo");
    expect(frame).toContain("└");
    expect(frame).toContain("Thought");
    expect(frame).toContain("Thinking through the repo layout.");
    expect(frame).toContain("Done");
    expect(frame).toContain("Read");
    expect(frame).toContain("src/index.ts");
    expect(frame).toContain("gpt-5.4");
  });

  test("merges_matching_workspace_patch_into_edit_tool_call_card", async () => {
    const matchingWorkspacePatch = createSingleFileWorkspacePatch({
      toolCallId: "call-edit-1",
      filePath: "src/utils.ts",
      addedLineCount: 2,
      removedLineCount: 1,
      unifiedDiffText: [
        "diff --git a/src/utils.ts b/src/utils.ts",
        "--- a/src/utils.ts",
        "+++ b/src/utils.ts",
        "@@ -1,1 +1,2 @@",
        "-const oldName = 1;",
        "+const newName = 1;",
        "+const extra = 2;",
        "",
      ].join("\n"),
    });
    const conversationMessages: ConversationMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        messageStatus: "completed",
        createdAtMs: 2,
        partIds: ["tool-1", "patch-1"],
      },
    ];
    const conversationMessagePartsByMessageId: Record<string, ConversationMessagePart[]> = {
      "assistant-1": [
        {
          id: "tool-1",
          partKind: "assistant_tool_call",
          toolCallId: "call-edit-1",
          toolCallStatus: "completed",
          toolCallStartedAtMs: 2,
          toolCallDetail: {
            toolName: "edit",
            editedFilePath: "src/utils.ts",
            addedLineCount: 99,
            removedLineCount: 88,
          },
          durationMs: 20,
        },
        {
          id: "patch-1",
          partKind: "assistant_workspace_patch",
          workspacePatch: matchingWorkspacePatch,
        },
      ],
    };

    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationMessageList
        conversationMessages={conversationMessages}
        isReasoningSummaryVisible={true}
        resolveConversationMessageParts={(messageId) => conversationMessagePartsByMessageId[messageId] ?? []}
        conversationMessageScrollBoxRef={{ current: null }}
        horizontalRuleColor="#10B981"
        userMessageBorderColor="#10B981"
      />,
      { width: 100, height: 16 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Edit");
    expect(frame).toContain("[src/utils.ts]");
    expect(frame).toContain("+2");
    expect(frame).toContain("-1");
    expect(frame).not.toContain("workspace patch");
    expect(frame).not.toContain("M src/utils.ts");
    expect(frame).not.toContain("newName");
  });

  test("renders_unmatched_workspace_patch_as_standalone_fallback", async () => {
    const unmatchedWorkspacePatch = createSingleFileWorkspacePatch({
      toolCallId: "call-other-1",
      filePath: "src/generated.ts",
      addedLineCount: 1,
      removedLineCount: 0,
      unifiedDiffText: [
        "diff --git a/src/generated.ts b/src/generated.ts",
        "--- a/src/generated.ts",
        "+++ b/src/generated.ts",
        "@@ -0,0 +1,1 @@",
        "+export const generated = true;",
        "",
      ].join("\n"),
    });
    const conversationMessages: ConversationMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        messageStatus: "completed",
        createdAtMs: 2,
        partIds: ["tool-1", "patch-1"],
      },
    ];
    const conversationMessagePartsByMessageId: Record<string, ConversationMessagePart[]> = {
      "assistant-1": [
        {
          id: "tool-1",
          partKind: "assistant_tool_call",
          toolCallId: "call-edit-1",
          toolCallStatus: "completed",
          toolCallStartedAtMs: 2,
          toolCallDetail: { toolName: "edit", editedFilePath: "src/utils.ts" },
          durationMs: 20,
        },
        {
          id: "patch-1",
          partKind: "assistant_workspace_patch",
          workspacePatch: unmatchedWorkspacePatch,
        },
      ],
    };

    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationMessageList
        conversationMessages={conversationMessages}
        isReasoningSummaryVisible={true}
        resolveConversationMessageParts={(messageId) => conversationMessagePartsByMessageId[messageId] ?? []}
        conversationMessageScrollBoxRef={{ current: null }}
        horizontalRuleColor="#10B981"
        userMessageBorderColor="#10B981"
      />,
      { width: 100, height: 16 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Edit");
    expect(frame).toContain("workspace patch");
    expect(frame).toContain("M src/generated.ts (+1 -0)");
    expect(frame).toContain("generated");
  });

  test("hides_reasoning_part_when_reasoning_summaries_are_not_visible", async () => {
    const conversationMessages: ConversationMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        messageStatus: "completed",
        createdAtMs: 2,
        partIds: ["reasoning-1"],
      },
    ];
    const conversationMessagePartsByMessageId: Record<string, ConversationMessagePart[]> = {
      "assistant-1": [
        {
          id: "reasoning-1",
          partKind: "assistant_reasoning",
          partStatus: "completed",
          reasoningSummaryText: "Hidden chain summary.",
          reasoningStartedAtMs: 2,
          reasoningDurationMs: 800,
          reasoningTokenCount: 12,
        },
      ],
    };
    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationMessageList
        conversationMessages={conversationMessages}
        isReasoningSummaryVisible={false}
        resolveConversationMessageParts={(messageId) => conversationMessagePartsByMessageId[messageId] ?? []}
        conversationMessageScrollBoxRef={{ current: null }}
        horizontalRuleColor="#10B981"
        userMessageBorderColor="#10B981"
      />,
      { width: 100, height: 8 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).not.toContain("Thought");
    expect(frame).not.toContain("12 reasoning tok");
    expect(frame).not.toContain("Hidden chain summary.");
  });

  test("does_not_render_completed_reasoning_without_summary_text", async () => {
    const conversationMessages: ConversationMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        messageStatus: "completed",
        createdAtMs: 2,
        partIds: ["reasoning-1"],
      },
    ];
    const conversationMessagePartsByMessageId: Record<string, ConversationMessagePart[]> = {
      "assistant-1": [
        {
          id: "reasoning-1",
          partKind: "assistant_reasoning",
          partStatus: "completed",
          reasoningSummaryText: "",
          reasoningStartedAtMs: 2,
          reasoningDurationMs: 800,
          reasoningTokenCount: 12,
        },
      ],
    };
    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationMessageList
        conversationMessages={conversationMessages}
        isReasoningSummaryVisible={true}
        resolveConversationMessageParts={(messageId) => conversationMessagePartsByMessageId[messageId] ?? []}
        conversationMessageScrollBoxRef={{ current: null }}
        horizontalRuleColor="#10B981"
        userMessageBorderColor="#10B981"
      />,
      { width: 100, height: 8 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).not.toContain("Thought");
    expect(frame).not.toContain("12 reasoning tok");
  });

  test("lets the OpenTUI scrollbox own mouse wheel scrolling", async () => {
    const conversationMessageScrollBoxRef: { current: ScrollBoxRenderable | null } = { current: null };
    const { mockMouse, renderOnce } = await testRender(
      <ConversationMessageList
        conversationMessages={Array.from({ length: 20 }, (_, index) => ({
          id: `message-${index}`,
          role: "user" as const,
          messageStatus: "completed" as const,
          createdAtMs: index,
          partIds: [`part-${index}`],
        }))}
        isReasoningSummaryVisible={true}
        resolveConversationMessageParts={(messageId) => [{
          id: `part-${messageId}`,
          partKind: "user_text",
          text: `Message ${messageId}`,
        }]}
        conversationMessageScrollBoxRef={conversationMessageScrollBoxRef}
        horizontalRuleColor="#10B981"
        userMessageBorderColor="#10B981"
      />,
      { width: 80, height: 20 },
    );

    await renderOnce();
    conversationMessageScrollBoxRef.current?.scrollTo(0);
    await mockMouse.scroll(5, 2, "down");
    await renderOnce();
    expect(conversationMessageScrollBoxRef.current?.scrollTop).toBeGreaterThan(0);
  });

  test("keeps_the_latest_message_visible_for_long_transcripts", async () => {
    const conversationMessages: ConversationMessage[] = Array.from({ length: 220 }, (_, messageIndex) => ({
      id: `message-${messageIndex}`,
      role: "assistant" as const,
      messageStatus: "completed" as const,
      createdAtMs: messageIndex,
      partIds: [`part-${messageIndex}`],
    }));
    const latestMessageIndex = conversationMessages.length - 1;

    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationMessageList
        conversationMessages={conversationMessages}
        isReasoningSummaryVisible={true}
        resolveConversationMessageParts={(messageId) => [{
          id: `part-${messageId}`,
          partKind: "assistant_text",
          partStatus: "completed",
          rawMarkdownText: `Transcript message ${messageId}`,
        }]}
        conversationMessageScrollBoxRef={{ current: null }}
        horizontalRuleColor="#10B981"
        userMessageBorderColor="#10B981"
      />,
      { width: 40, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain(`Transcript message message-${latestMessageIndex}`);
    expect(frame).not.toContain("Transcript message message-0");
  });
});
