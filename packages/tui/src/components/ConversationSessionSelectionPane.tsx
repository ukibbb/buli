import type { ReactNode } from "react";
import type { ConversationSessionSummary } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

const MAX_VISIBLE_CONVERSATION_SESSION_COUNT = 8;

function selectVisibleConversationSessionWindow(input: {
  conversationSessions: readonly ConversationSessionSummary[];
  highlightedConversationSessionIndex: number;
}): {
  firstVisibleConversationSessionIndex: number;
  visibleConversationSessions: readonly ConversationSessionSummary[];
} {
  const latestFirstVisibleConversationSessionIndex = Math.max(
    0,
    input.conversationSessions.length - MAX_VISIBLE_CONVERSATION_SESSION_COUNT,
  );
  const firstVisibleConversationSessionIndex = Math.min(
    Math.max(0, input.highlightedConversationSessionIndex - (MAX_VISIBLE_CONVERSATION_SESSION_COUNT - 1)),
    latestFirstVisibleConversationSessionIndex,
  );

  return {
    firstVisibleConversationSessionIndex,
    visibleConversationSessions: input.conversationSessions.slice(
      firstVisibleConversationSessionIndex,
      firstVisibleConversationSessionIndex + MAX_VISIBLE_CONVERSATION_SESSION_COUNT,
    ),
  };
}

export type ConversationSessionSelectionPaneProps = {
  conversationSessions: readonly ConversationSessionSummary[];
  highlightedConversationSessionIndex: number;
  activeConversationSessionId: string | undefined;
};

export function ConversationSessionSelectionPane(props: ConversationSessionSelectionPaneProps): ReactNode {
  const { firstVisibleConversationSessionIndex, visibleConversationSessions } = selectVisibleConversationSessionWindow({
    conversationSessions: props.conversationSessions,
    highlightedConversationSessionIndex: props.highlightedConversationSessionIndex,
  });

  return (
    <box
      borderStyle="rounded"
      borderColor={chatScreenTheme.border}
      backgroundColor={chatScreenTheme.surfaceOne}
      flexDirection="column"
      flexShrink={0}
      marginX={2}
      marginBottom={1}
      paddingX={1}
    >
      <text fg={chatScreenTheme.textMuted}>Sessions</text>
      {visibleConversationSessions.length === 0 ? (
        <text fg={chatScreenTheme.textSecondary}>No saved sessions.</text>
      ) : (
        visibleConversationSessions.map((conversationSession, index) => {
          const isHighlightedConversationSession =
            firstVisibleConversationSessionIndex + index === props.highlightedConversationSessionIndex;
          const activeMarker = conversationSession.sessionId === props.activeConversationSessionId ? " active" : "";
          return (
            <box key={conversationSession.sessionId} flexDirection="row" gap={1} width="100%">
              <text fg={isHighlightedConversationSession ? chatScreenTheme.accentGreen : chatScreenTheme.textDim}>
                {isHighlightedConversationSession ? ">" : " "}
              </text>
              <box flexGrow={1}>
                <text
                  fg={isHighlightedConversationSession ? chatScreenTheme.textPrimary : chatScreenTheme.textSecondary}
                  wrapMode="none"
                  truncate={true}
                >
                  {conversationSession.title}
                </text>
              </box>
              <text fg={chatScreenTheme.textMuted} wrapMode="none">
                {`${conversationSession.conversationSessionEntryCount} entries${activeMarker}`}
              </text>
            </box>
          );
        })
      )}
    </box>
  );
}
