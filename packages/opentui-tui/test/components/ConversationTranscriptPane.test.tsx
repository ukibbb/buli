import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import type { ConversationTranscriptEntry } from "../../src/chatScreenState.ts";
import { ConversationTranscriptPane } from "../../src/components/ConversationTranscriptPane.tsx";

describe("ConversationTranscriptPane", () => {
  test("renders_empty_transcript_without_crashing", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationTranscriptPane
        conversationTranscriptEntries={[]}
        hiddenTranscriptRowsAboveViewport={0}
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
        onConversationTranscriptViewportMeasured={() => {}}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("Something went wrong");
  });
});
