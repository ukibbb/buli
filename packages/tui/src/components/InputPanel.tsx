import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { PromptDraftText } from "./PromptDraftText.tsx";
import {
  PromptTextarea,
  PROMPT_TEXTAREA_MAX_ROW_COUNT,
  PROMPT_TEXTAREA_MIN_ROW_COUNT,
  type PromptTextareaEdit,
  type PromptTextareaSummarizedPaste,
} from "./PromptTextarea.tsx";

// Frame is pure prompt: 2 border rows + the textarea body.
export const INPUT_PANEL_MAX_ROW_COUNT = 2 + PROMPT_TEXTAREA_MAX_ROW_COUNT;

export type InputPanelProps = {
  promptDraft: string;
  promptDraftCursorOffset: number;
  promptImageAttachmentPlaceholderTexts?: readonly string[] | undefined;
  promptTextPastePlaceholderTexts?: readonly string[] | undefined;
  selectedPromptContextReferenceTexts?: readonly string[];
  isPromptInputDisabled: boolean;
  accentColor: string;
  onPromptDraftEdited: (promptTextareaEdit: PromptTextareaEdit) => void;
  onPromptSubmitted: () => void;
  onNativeClipboardPasteRequested?: () => void | Promise<void>;
  onSummarizedPromptTextPasted?: (summarizedPromptTextPaste: PromptTextareaSummarizedPaste) => void;
};

export function InputPanel(props: InputPanelProps): ReactNode {
  return (
    <box
      borderStyle="rounded"
      borderColor={props.accentColor}
      flexDirection="column"
      backgroundColor={chatScreenTheme.bg}
      flexShrink={0}
      marginX={2}
    >
      <box
        flexDirection="row"
        paddingX={1}
        gap={1}
        minHeight={PROMPT_TEXTAREA_MIN_ROW_COUNT}
        maxHeight={PROMPT_TEXTAREA_MAX_ROW_COUNT}
        overflow="hidden"
      >
        <text fg={props.accentColor}>
          <b>{">"}</b>
        </text>
        <box flexGrow={1} minWidth={0} overflow="hidden" paddingRight={3}>
          {props.isPromptInputDisabled ? (
            <PromptDraftText
              promptDraft={props.promptDraft}
              promptDraftCursorOffset={props.promptDraftCursorOffset}
              selectedPromptContextReferenceTexts={props.selectedPromptContextReferenceTexts}
              promptContextReferenceTextColor={props.accentColor}
              cursorCharacter=" "
              shouldRenderPromptDraftOnSingleLine={false}
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
              onPromptDraftEdited={props.onPromptDraftEdited}
              onPromptSubmitted={props.onPromptSubmitted}
              onNativeClipboardPasteRequested={props.onNativeClipboardPasteRequested}
              onSummarizedPromptTextPasted={props.onSummarizedPromptTextPasted}
            />
          )}
        </box>
      </box>
    </box>
  );
}
