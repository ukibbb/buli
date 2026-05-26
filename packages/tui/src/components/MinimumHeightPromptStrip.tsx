import type { ReactNode } from "react";
import type { ConversationTurnStatus } from "@buli/contracts";
import type { ConversationSessionCompactionStatus } from "@buli/chat-app-controller";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { PromptDraftText } from "./PromptDraftText.tsx";
import { PromptTextarea, type PromptTextareaEdit, type PromptTextareaSummarizedPaste } from "./PromptTextarea.tsx";
import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";

// Single-row degraded replacement for InputPanel used at minimumTerminalSizeTier.
// Drops every secondary element (mode chip, model chip, help footer, context
// meter) so the prompt caret and draft stay visible even when
// the terminal collapses to ~6 rows.
//
// Exported row count is the source of truth for ChatScreen's responsive
// budgeting math — keep it in sync with the rendered output below.
export const MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT = 1;

export type MinimumHeightPromptStripProps = {
  promptDraft: string;
  promptDraftCursorOffset: number;
  promptImageAttachmentPlaceholderTexts?: readonly string[] | undefined;
  promptTextPastePlaceholderTexts?: readonly string[] | undefined;
  selectedPromptContextReferenceTexts?: readonly string[];
  isPromptInputDisabled: boolean;
  queuedPromptCount: number;
  accentColor: string;
  assistantResponseStatus: ConversationTurnStatus;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  isActiveTurnInterruptConfirmationArmed?: boolean;
  onPromptDraftEdited: (promptTextareaEdit: PromptTextareaEdit) => void;
  onPromptSubmitted: () => void;
  onNativeClipboardPasteRequested?: () => void | Promise<void>;
  onSummarizedPromptTextPasted?: (summarizedPromptTextPaste: PromptTextareaSummarizedPaste) => void;
};

export function MinimumHeightPromptStrip(props: MinimumHeightPromptStripProps): ReactNode {
  const isAssistantTurnActive = props.assistantResponseStatus === "streaming_assistant_response" ||
    props.assistantResponseStatus === "waiting_for_tool_approval";
  const isConversationCompactionRunning = props.conversationSessionCompactionStatus.step === "compacting";
  if ((isAssistantTurnActive || isConversationCompactionRunning) && props.isPromptInputDisabled) {
    return (
      <box
        backgroundColor={chatScreenTheme.surfaceOne}
        flexDirection="row"
        paddingX={1}
        gap={1}
        flexShrink={0}
        width="100%"
      >
        <SnakeAnimationIndicator variant="sixCell" />
      </box>
    );
  }

  const cursorCharacter = props.isPromptInputDisabled ? " " : "█";
  return (
    <box
      backgroundColor={chatScreenTheme.surfaceOne}
      flexDirection="row"
      paddingX={1}
      gap={1}
      flexShrink={0}
      width="100%"
    >
      <text fg={props.accentColor}>
        <b>{">"}</b>
      </text>
      {props.conversationSessionCompactionStatus.step === "compacting" && props.conversationSessionCompactionStatus.source === "auto" ? (
        <SnakeAnimationIndicator variant="sixCell" />
      ) : null}
      <box flexGrow={1} minWidth={0} overflow="hidden" paddingRight={3}>
        {props.isPromptInputDisabled ? (
          <PromptDraftText
            promptDraft={props.promptDraft}
            promptDraftCursorOffset={props.promptDraftCursorOffset}
            selectedPromptContextReferenceTexts={props.selectedPromptContextReferenceTexts}
            promptContextReferenceTextColor={props.accentColor}
            cursorCharacter={cursorCharacter}
            shouldRenderPromptDraftOnSingleLine={true}
          />
        ) : (
          <PromptTextarea
            promptDraft={props.promptDraft}
            promptDraftCursorOffset={props.promptDraftCursorOffset}
            promptImageAttachmentPlaceholderTexts={props.promptImageAttachmentPlaceholderTexts}
            promptTextPastePlaceholderTexts={props.promptTextPastePlaceholderTexts}
            selectedPromptContextReferenceTexts={props.selectedPromptContextReferenceTexts}
            promptContextReferenceTextColor={props.accentColor}
            isFocused={true}
            rowCount={MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT}
            onPromptDraftEdited={props.onPromptDraftEdited}
            onPromptSubmitted={props.onPromptSubmitted}
            onNativeClipboardPasteRequested={props.onNativeClipboardPasteRequested}
            onSummarizedPromptTextPasted={props.onSummarizedPromptTextPasted}
          />
        )}
      </box>
    </box>
  );
}
