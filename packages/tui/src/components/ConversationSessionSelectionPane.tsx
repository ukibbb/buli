import { useState, type ReactNode } from "react";
import type { ConversationSessionSummary } from "@buli/contracts";
import { canDeleteConversationSessionFromSelection } from "@buli/chat-session-state";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SelectionPaneFrame } from "./SelectionPaneFrame.tsx";
import {
  calculateVisibleSelectionWindow,
  resolveSelectionPaneRowTextColor,
  SelectionPaneHighlightedRow,
} from "./SelectionPaneRows.tsx";
import { createClickableControlMouseDownHandler } from "./primitives/clickableControl.ts";

const MAX_VISIBLE_CONVERSATION_SESSION_COUNT = 8;
const CONVERSATION_SESSION_DELETE_CONTROL_WIDTH = 8;

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
        <text fg={chatScreenTheme.textSecondary} selectable={false}>
          No saved sessions.
        </text>
      </SelectionPaneFrame>
    );
  }

  const visibleConversationSessionWindow = calculateVisibleSelectionWindow({
    selectionItems: props.conversationSessions,
    highlightedSelectionItemIndex: props.highlightedConversationSessionIndex,
    maxVisibleSelectionItemCount: MAX_VISIBLE_CONVERSATION_SESSION_COUNT,
  });
  const visibleConversationSessionRows = visibleConversationSessionWindow.visibleSelectionItems.flatMap(
    (conversationSession, visibleConversationSessionOffset) => {
      const dayLabel = formatConversationSessionDayLabel(conversationSession.updatedAtMs);
      const previousConversationSession = visibleConversationSessionWindow.visibleSelectionItems[visibleConversationSessionOffset - 1];
      const shouldRenderDayHeader =
        !previousConversationSession || formatConversationSessionDayLabel(previousConversationSession.updatedAtMs) !== dayLabel;

      return [
        ...(shouldRenderDayHeader
          ? [
              {
                rowKind: "day_header" as const,
                dayLabel,
                rowKey: `${dayLabel}-${visibleConversationSessionWindow.firstVisibleSelectionItemIndex + visibleConversationSessionOffset}`,
              },
            ]
          : []),
        {
          rowKind: "conversation_session" as const,
          conversationSession,
          conversationSessionIndex: visibleConversationSessionWindow.firstVisibleSelectionItemIndex + visibleConversationSessionOffset,
        },
      ];
    },
  );
  return (
    <SelectionPaneFrame accentColor={props.accentColor}>
      {visibleConversationSessionRows.map((row) =>
        row.rowKind === "day_header" ? (
          <box flexShrink={0} height={1} key={row.rowKey} width="100%">
            <text fg={chatScreenTheme.accentPrimaryMuted} selectable={false} truncate={true} wrapMode="none">
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
            highlightedConversationSessionIndex={visibleConversationSessionWindow.highlightedSelectionItemIndex}
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
    <SelectionPaneHighlightedRow isHighlighted={isHighlightedConversationSession}>
      <box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
        <text
          fg={resolveSelectionPaneRowTextColor({
            isHighlighted: isHighlightedConversationSession,
            unhighlightedTextColor: chatScreenTheme.textSecondary,
          })}
          selectable={false}
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
    </SelectionPaneHighlightedRow>
  );
}

function ConversationSessionDeleteControl(props: {
  conversationSessionId: string;
  isAwaitingDeleteConfirmation: boolean;
  onConversationSessionDeletionRequested: (conversationSessionId: string) => void | Promise<void>;
}): ReactNode {
  const [isPointerHovering, setIsPointerHovering] = useState(false);
  const deleteActionLabel = props.isAwaitingDeleteConfirmation ? "confirm" : "delete";
  const deleteActionColor = props.isAwaitingDeleteConfirmation
    ? chatScreenTheme.textPrimary
    : (isPointerHovering ? chatScreenTheme.accentRed : chatScreenTheme.textDim);

  return (
    <box
      {...(props.isAwaitingDeleteConfirmation ? { backgroundColor: chatScreenTheme.accentRed } : {})}
      flexDirection="row"
      flexShrink={0}
      justifyContent="center"
      marginLeft={1}
      onMouseDown={createClickableControlMouseDownHandler(() =>
        props.onConversationSessionDeletionRequested(props.conversationSessionId)
      )}
      onMouseOut={() => setIsPointerHovering(false)}
      onMouseOver={() => setIsPointerHovering(true)}
      width={CONVERSATION_SESSION_DELETE_CONTROL_WIDTH}
    >
      <text fg={deleteActionColor} selectable={false} wrapMode="none">
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
  const modelSelectionLabel = formatConversationSessionModelSelectionLabel(conversationSession);
  const modelSelectionFragment = modelSelectionLabel ? ` ${modelSelectionLabel}` : "";
  return `${conversationSession.title}${modelSelectionFragment} ${conversationSession.conversationSessionEntryCount} entries${activeMarker}`;
}

function formatConversationSessionModelSelectionLabel(conversationSession: ConversationSessionSummary): string | undefined {
  const modelSelection = conversationSession.modelSelection;
  if (!modelSelection) {
    return undefined;
  }

  const reasoningEffortLabel = modelSelection.selectedReasoningEffort ??
    modelSelection.selectedModelDefaultReasoningEffort ??
    "default";
  return `${modelSelection.selectedModelId}/${reasoningEffortLabel}`;
}
