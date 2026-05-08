import { describe, expect, test } from "bun:test";
import { ConversationSessionSelectionPane } from "../../src/components/ConversationSessionSelectionPane.tsx";
import { testRender } from "../testRenderWithCleanup.ts";

describe("ConversationSessionSelectionPane", () => {
  test("renders_sessions_with_entry_counts_and_active_marker", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationSessionSelectionPane
        conversationSessions={[
          {
            sessionId: "session-1",
            title: "Planning session",
            createdAtMs: 1,
            updatedAtMs: 2,
            conversationSessionEntryCount: 3,
          },
          {
            sessionId: "session-2",
            title: "Implementation session",
            createdAtMs: 3,
            updatedAtMs: 4,
            conversationSessionEntryCount: 5,
          },
        ]}
        highlightedConversationSessionIndex={1}
        activeConversationSessionId="session-2"
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Sessions");
    expect(frame).toContain("Planning session 3 entries");
    expect(frame).toContain("\u25b6 Implementation session 5 entries active");
  });

  test("keeps_the_highlighted_session_visible_after_the_first_eight_results", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationSessionSelectionPane
        conversationSessions={Array.from({ length: 10 }, (_value, index) => ({
          sessionId: `session-${index + 1}`,
          title: `Session ${index + 1}`,
          createdAtMs: index,
          updatedAtMs: index,
          conversationSessionEntryCount: index + 1,
        }))}
        highlightedConversationSessionIndex={8}
        activeConversationSessionId="session-1"
      />,
      { width: 80, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Session 9 9 entries");
    expect(frame).not.toContain("Session 1 1 entries active");
  });
});
