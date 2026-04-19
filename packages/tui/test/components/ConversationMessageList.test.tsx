import { describe, expect, test } from "bun:test";
import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import { testRender } from "../testRenderWithCleanup.ts";
import { ConversationMessageList } from "../../src/components/ConversationMessageList.tsx";

describe("ConversationMessageList", () => {
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
          reasoningSummaryText: "Thinking",
          reasoningStartedAtMs: 2,
          reasoningDurationMs: 800,
          reasoningTokenCount: 12,
        },
        {
          id: "assistant-text-1",
          partKind: "assistant_text",
          partStatus: "completed",
          rawMarkdownText: "# Done",
          completedContentParts: [
            { kind: "heading", headingLevel: 1, inlineSpans: [{ spanKind: "plain", spanText: "Done" }] },
          ],
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
        resolveConversationMessageParts={(messageId) => conversationMessagePartsByMessageId[messageId] ?? []}
        conversationMessageScrollBoxRef={{ current: null }}
        onConversationMessageWheelScroll={() => {}}
      />,
      { width: 100, height: 24 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Inspect the repo");
    expect(frame).toContain("Done");
    expect(frame).toContain("Read");
    expect(frame).toContain("src/index.ts");
    expect(frame).toContain("gpt-5.4");
  });

  test("forwards mouse wheel direction to the parent callback", async () => {
    let scrolledDirection: "up" | "down" | undefined;
    const { mockMouse, renderOnce } = await testRender(
      <ConversationMessageList
        conversationMessages={[]}
        resolveConversationMessageParts={() => []}
        conversationMessageScrollBoxRef={{ current: null }}
        onConversationMessageWheelScroll={(direction) => {
          scrolledDirection = direction;
        }}
      />,
      { width: 80, height: 20 },
    );

    await renderOnce();
    await mockMouse.scroll(5, 2, "down");
    await renderOnce();
    expect(scrolledDirection).toBe("down");
  });
});
