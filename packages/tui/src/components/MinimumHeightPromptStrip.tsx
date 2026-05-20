import type { ReactNode } from "react";
import type { ConversationTurnStatus, UserPromptImageAttachment } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { PromptDraftText } from "./PromptDraftText.tsx";
import { PromptTextarea, type PromptTextareaEdit } from "./PromptTextarea.tsx";
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
  pendingPromptImageAttachments?: readonly UserPromptImageAttachment[];
  selectedPromptContextReferenceTexts?: readonly string[];
  isPromptInputDisabled: boolean;
  accentColor: string;
  assistantResponseStatus: ConversationTurnStatus;
  isActiveTurnInterruptConfirmationArmed?: boolean;
  onPromptDraftEdited: (promptTextareaEdit: PromptTextareaEdit) => void;
  onPromptSubmitted: () => void;
  onNativeClipboardPasteRequested?: () => void | Promise<void>;
};

export function MinimumHeightPromptStrip(props: MinimumHeightPromptStripProps): ReactNode {
  const isAssistantTurnActive = props.assistantResponseStatus === "streaming_assistant_response" ||
    props.assistantResponseStatus === "waiting_for_tool_approval";
  if (isAssistantTurnActive) {
    return (
      <box
        backgroundColor={chatScreenTheme.surfaceOne}
        flexDirection="row"
        paddingX={1}
        flexShrink={0}
        width="100%"
      >
        <SnakeAnimationIndicator />
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
      {props.pendingPromptImageAttachments?.map((attachment, attachmentIndex) => (
        <text fg={chatScreenTheme.accentCyan} key={attachment.attachmentId}>
          {`[Image ${attachmentIndex + 1}]`}
        </text>
      ))}
      <box flexGrow={1} minWidth={0} overflow="hidden" width="100%">
        {props.isPromptInputDisabled ? (
          <PromptDraftText
            promptDraft={props.promptDraft}
            promptDraftCursorOffset={props.promptDraftCursorOffset}
            selectedPromptContextReferenceTexts={props.selectedPromptContextReferenceTexts}
            cursorCharacter={cursorCharacter}
            shouldRenderPromptDraftOnSingleLine={true}
          />
        ) : (
          <PromptTextarea
            promptDraft={props.promptDraft}
            promptDraftCursorOffset={props.promptDraftCursorOffset}
            isFocused={true}
            rowCount={MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT}
            onPromptDraftEdited={props.onPromptDraftEdited}
            onPromptSubmitted={props.onPromptSubmitted}
            onNativeClipboardPasteRequested={props.onNativeClipboardPasteRequested}
          />
        )}
      </box>
    </box>
  );
}
