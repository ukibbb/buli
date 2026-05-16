import type { ReactNode } from "react";
import type { ConversationSessionSummary } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SelectionPaneFrame } from "./SelectionPaneFrame.tsx";

const MAX_VISIBLE_CONVERSATION_SESSION_COUNT = 8;

export type ConversationSessionSelectionPaneProps = {
  conversationSessions: readonly ConversationSessionSummary[];
  highlightedConversationSessionIndex: number;
  activeConversationSessionId: string | undefined;
  accentColor: string;
};

export function ConversationSessionSelectionPane(props: ConversationSessionSelectionPaneProps): ReactNode {
  if (props.conversationSessions.length === 0) {
    return (
      <SelectionPaneFrame accentColor={props.accentColor}>
        <text fg={chatScreenTheme.textSecondary}>No saved sessions.</text>
      </SelectionPaneFrame>
    );
  }

  const lastPossibleFirstVisibleConversationSessionIndex = Math.max(
    0,
    props.conversationSessions.length - MAX_VISIBLE_CONVERSATION_SESSION_COUNT,
  );
  const highlightedConversationSessionIndex = Math.max(
    0,
    Math.min(props.highlightedConversationSessionIndex, props.conversationSessions.length - 1),
  );
  const firstVisibleConversationSessionIndex = Math.min(
    lastPossibleFirstVisibleConversationSessionIndex,
    Math.max(0, highlightedConversationSessionIndex - MAX_VISIBLE_CONVERSATION_SESSION_COUNT + 1),
  );
  const visibleConversationSessions = props.conversationSessions.slice(
    firstVisibleConversationSessionIndex,
    firstVisibleConversationSessionIndex + MAX_VISIBLE_CONVERSATION_SESSION_COUNT,
  );
  const visibleConversationSessionRows = visibleConversationSessions.flatMap(
    (conversationSession, visibleConversationSessionOffset) => {
      const dayLabel = formatConversationSessionDayLabel(conversationSession.updatedAtMs);
      const previousConversationSession = visibleConversationSessions[visibleConversationSessionOffset - 1];
      const shouldRenderDayHeader =
        !previousConversationSession || formatConversationSessionDayLabel(previousConversationSession.updatedAtMs) !== dayLabel;

      return [
        ...(shouldRenderDayHeader
          ? [
              {
                rowKind: "day_header" as const,
                dayLabel,
                rowKey: `${dayLabel}-${firstVisibleConversationSessionIndex + visibleConversationSessionOffset}`,
              },
            ]
          : []),
        {
          rowKind: "conversation_session" as const,
          conversationSession,
          conversationSessionIndex: firstVisibleConversationSessionIndex + visibleConversationSessionOffset,
        },
      ];
    },
  );

  return (
    <SelectionPaneFrame accentColor={props.accentColor}>
      {visibleConversationSessionRows.map((row) =>
        row.rowKind === "day_header" ? (
          <box flexShrink={0} height={1} key={row.rowKey} width="100%">
            <text fg={chatScreenTheme.accentPrimaryMuted} truncate={true} wrapMode="none">
              <b>{row.dayLabel}</b>
            </text>
          </box>
        ) : (
          <box
            backgroundColor={
              row.conversationSessionIndex === highlightedConversationSessionIndex
                ? chatScreenTheme.borderSubtle
                : chatScreenTheme.surfaceOne
            }
            flexDirection="row"
            flexShrink={0}
            height={1}
            key={row.conversationSession.sessionId}
            width="100%"
          >
            <text
              fg={
                row.conversationSessionIndex === highlightedConversationSessionIndex
                  ? chatScreenTheme.textPrimary
                  : chatScreenTheme.textSecondary
              }
              truncate={true}
              wrapMode="none"
            >
              {formatConversationSessionOptionLabel(
                row.conversationSession,
                row.conversationSession.sessionId === props.activeConversationSessionId,
              )}
            </text>
          </box>
        ),
      )}
    </SelectionPaneFrame>
  );
}

function formatConversationSessionDayLabel(updatedAtMs: number): string {
  const updatedAt = new Date(updatedAtMs);
  const now = new Date();
  if (
    updatedAt.getFullYear() === now.getFullYear() &&
    updatedAt.getMonth() === now.getMonth() &&
    updatedAt.getDate() === now.getDate()
  ) {
    return "Today";
  }

  return updatedAt.toDateString();
}

function formatConversationSessionOptionLabel(
  conversationSession: ConversationSessionSummary,
  isActiveConversationSession: boolean,
): string {
  const activeMarker = isActiveConversationSession ? " active" : "";
  return `${conversationSession.title} ${conversationSession.conversationSessionEntryCount} entries${activeMarker}`;
}
