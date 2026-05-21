import { useState, type ReactNode } from "react";
import type { ConversationSessionSummary } from "@buli/contracts";
import { canDeleteConversationSessionFromSelection } from "@buli/chat-session-state";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SelectionPaneFrame } from "./SelectionPaneFrame.tsx";

const MAX_VISIBLE_CONVERSATION_SESSION_COUNT = 8;
const CONVERSATION_SESSION_DELETE_CONTROL_WIDTH = 12;

export type ConversationSessionSelectionPaneProps = {
  conversationSessions: readonly ConversationSessionSummary[];
  highlightedConversationSessionIndex: number;
  activeConversationSessionId: string | undefined;
  pendingDeletionConversationSessionId: string | undefined;
  accentColor: string;
  onConversationSessionDeletionRequested: (conversationSessionId: string) => void | Promise<void>;
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
          <ConversationSessionOptionRow
            activeConversationSessionId={props.activeConversationSessionId}
            canDeleteConversationSession={canDeleteConversationSessionFromSelection(
              props.conversationSessions,
              row.conversationSession.sessionId,
            )}
            conversationSession={row.conversationSession}
            conversationSessionIndex={row.conversationSessionIndex}
            highlightedConversationSessionIndex={highlightedConversationSessionIndex}
            isAwaitingDeleteConfirmation={row.conversationSession.sessionId === props.pendingDeletionConversationSessionId}
            key={row.conversationSession.sessionId}
            onConversationSessionDeletionRequested={props.onConversationSessionDeletionRequested}
          />
        ),
      )}
    </SelectionPaneFrame>
  );
}

function ConversationSessionOptionRow(props: {
  conversationSession: ConversationSessionSummary;
  conversationSessionIndex: number;
  highlightedConversationSessionIndex: number;
  activeConversationSessionId: string | undefined;
  canDeleteConversationSession: boolean;
  isAwaitingDeleteConfirmation: boolean;
  onConversationSessionDeletionRequested: (conversationSessionId: string) => void | Promise<void>;
}): ReactNode {
  const isHighlightedConversationSession = props.conversationSessionIndex === props.highlightedConversationSessionIndex;
  return (
    <box
      backgroundColor={isHighlightedConversationSession ? chatScreenTheme.borderSubtle : chatScreenTheme.surfaceOne}
      flexDirection="row"
      flexShrink={0}
      height={1}
      width="100%"
    >
      <box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
        <text
          fg={isHighlightedConversationSession ? chatScreenTheme.textPrimary : chatScreenTheme.textSecondary}
          truncate={true}
          wrapMode="none"
          width="100%"
        >
          {formatConversationSessionOptionLabel(
            props.conversationSession,
            props.conversationSession.sessionId === props.activeConversationSessionId,
          )}
        </text>
      </box>
      {props.canDeleteConversationSession ? (
        <ConversationSessionDeleteControl
          conversationSessionId={props.conversationSession.sessionId}
          isAwaitingDeleteConfirmation={props.isAwaitingDeleteConfirmation}
          onConversationSessionDeletionRequested={props.onConversationSessionDeletionRequested}
        />
      ) : null}
    </box>
  );
}

function ConversationSessionDeleteControl(props: {
  conversationSessionId: string;
  isAwaitingDeleteConfirmation: boolean;
  onConversationSessionDeletionRequested: (conversationSessionId: string) => void | Promise<void>;
}): ReactNode {
  const [isPointerHovering, setIsPointerHovering] = useState(false);
  const deleteActionLabel = props.isAwaitingDeleteConfirmation ? "delete again" : "delete";
  const deleteActionColor = props.isAwaitingDeleteConfirmation
    ? (isPointerHovering ? chatScreenTheme.accentRed : chatScreenTheme.accentAmber)
    : (isPointerHovering ? chatScreenTheme.accentRed : chatScreenTheme.textDim);

  return (
    <box
      flexDirection="row"
      flexShrink={0}
      justifyContent="flex-end"
      marginLeft={1}
      onMouseDown={() => props.onConversationSessionDeletionRequested(props.conversationSessionId)}
      onMouseOut={() => setIsPointerHovering(false)}
      onMouseOver={() => setIsPointerHovering(true)}
      width={CONVERSATION_SESSION_DELETE_CONTROL_WIDTH}
    >
      <text fg={deleteActionColor} wrapMode="none">
        {deleteActionLabel}
      </text>
    </box>
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
