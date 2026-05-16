import { describe, expect, test } from "bun:test";
import { ConversationSessionSelectionPane } from "../../src/components/ConversationSessionSelectionPane.tsx";
import { testRender } from "../testRenderWithCleanup.ts";

describe("ConversationSessionSelectionPane", () => {
  test("renders_sessions_with_entry_counts_and_active_marker", async () => {
    const updatedAtMs = new Date(2000, 0, 1, 12).getTime();
    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationSessionSelectionPane
        conversationSessions={[
          {
            sessionId: "session-1",
            title: "Planning session",
            createdAtMs: 1,
            updatedAtMs,
            conversationSessionEntryCount: 3,
          },
          {
            sessionId: "session-2",
            title: "Implementation session",
            createdAtMs: 3,
            updatedAtMs,
            conversationSessionEntryCount: 5,
          },
        ]}
        highlightedConversationSessionIndex={1}
        activeConversationSessionId="session-2"
        accentColor="#00ff00"
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).not.toContain("Sessions");
    expect(frame).not.toContain("▶");
    expect(frame).toContain(new Date(updatedAtMs).toDateString());
    expect(frame).toContain("Planning session 3 entries");
    expect(frame).toContain("Implementation session 5 entries active");
  });

  test("groups_sessions_by_updated_day", async () => {
    const firstUpdatedAtMs = new Date(2000, 0, 2, 12).getTime();
    const secondUpdatedAtMs = new Date(2000, 0, 1, 12).getTime();
    const firstDayLabel = new Date(firstUpdatedAtMs).toDateString();
    const secondDayLabel = new Date(secondUpdatedAtMs).toDateString();

    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationSessionSelectionPane
        conversationSessions={[
          {
            sessionId: "session-1",
            title: "Planning session",
            createdAtMs: 1,
            updatedAtMs: firstUpdatedAtMs,
            conversationSessionEntryCount: 3,
          },
          {
            sessionId: "session-2",
            title: "Implementation session",
            createdAtMs: 3,
            updatedAtMs: secondUpdatedAtMs,
            conversationSessionEntryCount: 5,
          },
        ]}
        highlightedConversationSessionIndex={0}
        activeConversationSessionId={undefined}
        accentColor="#00ff00"
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain(firstDayLabel);
    expect(frame).toContain(secondDayLabel);
    expect(frame.indexOf(firstDayLabel)).toBeLessThan(frame.indexOf("Planning session"));
    expect(frame.indexOf(secondDayLabel)).toBeLessThan(frame.indexOf("Implementation session"));
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
        accentColor="#00ff00"
      />,
      { width: 80, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Session 9 9 entries");
    expect(frame).not.toContain("Session 1 1 entries active");
  });
});
