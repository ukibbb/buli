import { describe, expect, test } from "bun:test";
import { act } from "react";
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
        pendingDeletionConversationSessionId={undefined}
        accentColor="#00ff00"
        onConversationSessionDeletionRequested={() => {}}
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
    expect(frame).toContain("delete");
  });

  test("renders_session_model_and_reasoning_metadata_when_available", async () => {
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
            modelSelection: {
              selectedModelId: "gpt-5.5",
              selectedModelDefaultReasoningEffort: "medium",
              selectedReasoningEffort: "high",
            },
          },
          {
            sessionId: "session-2",
            title: "Implementation session",
            createdAtMs: 3,
            updatedAtMs,
            conversationSessionEntryCount: 5,
            modelSelection: {
              selectedModelId: "gpt-5.4",
              selectedModelDefaultReasoningEffort: "medium",
            },
          },
        ]}
        highlightedConversationSessionIndex={0}
        activeConversationSessionId="session-1"
        pendingDeletionConversationSessionId={undefined}
        accentColor="#00ff00"
        onConversationSessionDeletionRequested={() => {}}
      />,
      { width: 100, height: 8 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Planning session gpt-5.5/high 3 entries active");
    expect(frame).toContain("Implementation session gpt-5.4/medium 5 entries");
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
        pendingDeletionConversationSessionId={undefined}
        accentColor="#00ff00"
        onConversationSessionDeletionRequested={() => {}}
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
        pendingDeletionConversationSessionId={undefined}
        accentColor="#00ff00"
        onConversationSessionDeletionRequested={() => {}}
      />,
      { width: 80, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Session 9 9 entries");
    expect(frame).not.toContain("Session 1 1 entries active");
  });

  test("renders_confirmation_for_the_session_waiting_for_deletion", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationSessionSelectionPane
        conversationSessions={[
          {
            sessionId: "session-1",
            title: "Planning session",
            createdAtMs: 1,
            updatedAtMs: new Date(2000, 0, 1, 12).getTime(),
            conversationSessionEntryCount: 3,
          },
        ]}
        highlightedConversationSessionIndex={0}
        activeConversationSessionId="session-1"
        pendingDeletionConversationSessionId="session-1"
        accentColor="#00ff00"
        onConversationSessionDeletionRequested={() => {}}
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("confirm");
    expect(frame).not.toContain('Delete "Planning session"?');
    expect(frame).not.toContain("Delete again confirms");
    expect(frame).not.toContain("delete again");
  });

  test("does_not_render_delete_control_for_the_only_empty_session", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ConversationSessionSelectionPane
        conversationSessions={[
          {
            sessionId: "session-1",
            title: "New session",
            createdAtMs: 1,
            updatedAtMs: new Date(2000, 0, 1, 12).getTime(),
            conversationSessionEntryCount: 0,
          },
        ]}
        highlightedConversationSessionIndex={0}
        activeConversationSessionId="session-1"
        pendingDeletionConversationSessionId={undefined}
        accentColor="#00ff00"
        onConversationSessionDeletionRequested={() => {}}
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("New session 0 entries active");
    expect(frame).not.toContain("delete");
  });

  test("requests_deletion_when_the_delete_control_is_clicked", async () => {
    const requestedConversationSessionIds: string[] = [];
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <ConversationSessionSelectionPane
        conversationSessions={[
          {
            sessionId: "session-1",
            title: "Planning session",
            createdAtMs: 1,
            updatedAtMs: new Date(2000, 0, 1, 12).getTime(),
            conversationSessionEntryCount: 3,
          },
        ]}
        highlightedConversationSessionIndex={0}
        activeConversationSessionId="session-1"
        pendingDeletionConversationSessionId={undefined}
        accentColor="#00ff00"
        onConversationSessionDeletionRequested={(conversationSessionId) => {
          requestedConversationSessionIds.push(conversationSessionId);
        }}
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();
    const deleteTarget = findRenderedFrameTextPosition(captureCharFrame(), "Planning session", "delete");
    await act(async () => {
      await mockMouse.click(deleteTarget.column, deleteTarget.row);
    });

    expect(requestedConversationSessionIds).toEqual(["session-1"]);
  });
});

function findRenderedFrameTextPosition(renderedOutput: string, rowText: string, targetText: string): { column: number; row: number } {
  const renderedRows = renderedOutput.split("\n");
  const row = renderedRows.findIndex((renderedRow) => renderedRow.includes(rowText));
  if (row === -1) {
    throw new Error(`expected rendered output to contain a row with ${rowText}`);
  }

  const column = renderedRows[row]?.indexOf(targetText) ?? -1;
  if (column === -1) {
    throw new Error(`expected rendered row to contain ${targetText}`);
  }

  return { column, row };
}
