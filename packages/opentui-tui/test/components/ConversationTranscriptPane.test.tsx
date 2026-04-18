import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import type { ConversationTranscriptEntry } from "../../src/chatScreenState.ts";
import { ConversationTranscriptPane } from "../../src/components/ConversationTranscriptPane.tsx";

describe("ConversationTranscriptPane", () => {
  test("renders_empty_transcript_without_crashing", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationTranscriptPane
        conversationTranscriptEntries={[]}
        hiddenTranscriptRowsAboveViewport={0}
        isFollowingNewestTranscriptRows={true}
        onConversationTranscriptViewportMeasured={() => {}}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    // Empty transcript renders an empty flex box — just ensure no crash.
    expect(captureCharFrame()).toBeDefined();
  });

  test("renders_user_message_entry", async () => {
    const entries: ConversationTranscriptEntry[] = [
      {
        kind: "message",
        message: {
          id: "msg-1",
          role: "user",
          text: "Hello from the user",
        },
      },
    ];
    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationTranscriptPane
        conversationTranscriptEntries={entries}
        hiddenTranscriptRowsAboveViewport={0}
        isFollowingNewestTranscriptRows={true}
        onConversationTranscriptViewportMeasured={() => {}}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("Hello from the user");
  });

  test("renders_error_entry", async () => {
    const entries: ConversationTranscriptEntry[] = [
      { kind: "error", text: "Something went wrong" },
    ];
    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationTranscriptPane
        conversationTranscriptEntries={entries}
        hiddenTranscriptRowsAboveViewport={0}
        isFollowingNewestTranscriptRows={true}
        onConversationTranscriptViewportMeasured={() => {}}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("Something went wrong");
  });

  test("calls_onConversationTranscriptWheelScroll_when_mouse_wheel_moves_over_the_transcript", async () => {
    let scrolledDirection: "up" | "down" | undefined;
    const { mockMouse, renderOnce } = await testRender(
      <ConversationTranscriptPane
        conversationTranscriptEntries={[
          {
            kind: "message",
            message: {
              id: "msg-1",
              role: "assistant",
              text: "Line one\nLine two\nLine three",
            },
          },
        ]}
        hiddenTranscriptRowsAboveViewport={0}
        isFollowingNewestTranscriptRows={true}
        onConversationTranscriptViewportMeasured={() => {}}
        onConversationTranscriptWheelScroll={(direction) => {
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

  test("renders_a_dedicated_streaming_assistant_message_block", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationTranscriptPane
        conversationTranscriptEntries={[
          {
            kind: "streaming_assistant_message",
            messageId: "stream-1",
            renderState: "streaming",
            streamingProjection: {
              fullResponseText: "# Done\n\nTail text",
              completedContentParts: [
                {
                  kind: "heading",
                  headingLevel: 1,
                  inlineSpans: [{ spanKind: "plain", spanText: "Done" }],
                },
              ],
              openContentPart: {
                kind: "streaming_markdown_text",
                text: "Tail text",
              },
            },
          },
        ]}
        hiddenTranscriptRowsAboveViewport={0}
        isFollowingNewestTranscriptRows={true}
        onConversationTranscriptViewportMeasured={() => {}}
      />,
      { width: 80, height: 20 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("assistant · streaming");
    expect(frame).toContain("Done");
    expect(frame).toContain("working…");
  });
});
