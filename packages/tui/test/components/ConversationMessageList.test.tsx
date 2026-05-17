import { describe, expect, test } from "bun:test";
import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import type { ScrollBoxRenderable } from "@opentui/core";
import { testRender } from "../testRenderWithCleanup.ts";
import { ConversationMessageList } from "../../src/components/ConversationMessageList.tsx";

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
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();
    expect(captureCharFrame()).toContain("Thinking");
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
      />,
      { width: 100, height: 24 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Inspect the repo");
    expect(frame).toContain("Thinking");
    expect(frame).toContain("Thinking through the repo layout.");
    expect(frame).toContain("Done");
    expect(frame).toContain("Read");
    expect(frame).toContain("src/index.ts");
    expect(frame).toContain("gpt-5.4");
  });

  test("hides_reasoning_summary_text_when_reasoning_summaries_are_not_visible", async () => {
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
      />,
      { width: 100, height: 8 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Thinking");
    expect(frame).toContain("12 reasoning tok");
    expect(frame).not.toContain("Hidden chain summary.");
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
      />,
      { width: 40, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain(`Transcript message message-${latestMessageIndex}`);
    expect(frame).not.toContain("Transcript message message-0");
  });
});
