import type { ReactNode } from "react";
import type { ConversationSessionSummary } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SelectionPaneFrame } from "./SelectionPaneFrame.tsx";
import { SelectionPaneSelect } from "./SelectionPaneSelect.tsx";

const MAX_VISIBLE_CONVERSATION_SESSION_COUNT = 8;

export type ConversationSessionSelectionPaneProps = {
  conversationSessions: readonly ConversationSessionSummary[];
  highlightedConversationSessionIndex: number;
  activeConversationSessionId: string | undefined;
  accentColor: string;
};

export function ConversationSessionSelectionPane(props: ConversationSessionSelectionPaneProps): ReactNode {
  return (
    <SelectionPaneFrame accentColor={props.accentColor}>
      {props.conversationSessions.length === 0 ? (
        <text fg={chatScreenTheme.textSecondary}>No saved sessions.</text>
      ) : (
        <SelectionPaneSelect
          optionNames={props.conversationSessions.map((conversationSession) => {
            const activeMarker = conversationSession.sessionId === props.activeConversationSessionId ? " active" : "";
            return `${conversationSession.title} ${conversationSession.conversationSessionEntryCount} entries${activeMarker}`;
          })}
          highlightedOptionIndex={props.highlightedConversationSessionIndex}
          maxVisibleOptionCount={MAX_VISIBLE_CONVERSATION_SESSION_COUNT}
        />
      )}
    </SelectionPaneFrame>
  );
}
