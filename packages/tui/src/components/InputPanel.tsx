import type { ReactNode } from "react";
import type { ConversationTurnStatus, UserPromptImageAttachment } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ContextWindowMeter } from "./ContextWindowMeter.tsx";
import { glyphs } from "./glyphs.ts";
import { PromptDraftText } from "./PromptDraftText.tsx";
import {
  PromptTextarea,
  PROMPT_TEXTAREA_MAX_ROW_COUNT,
  PROMPT_TEXTAREA_MIN_ROW_COUNT,
  type PromptTextareaEdit,
} from "./PromptTextarea.tsx";
import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";

// Pen frame HOeet. Owns a header strip with mode + model chips, a body with
// the prompt draft and caret, and a footer that shows the activity indicator
// while streaming, a contextual override message when one is supplied, or only
// the context meter when idle.
//
// Exported max row count = 2 (rounded border) + 1 (header) + max textarea rows
// + 1 (footer). It is the source of truth for ChatScreen's responsive budgeting
// math — keep it in sync with the rendered output below.
export const INPUT_PANEL_MAX_ROW_COUNT = 2 + 1 + PROMPT_TEXTAREA_MAX_ROW_COUNT + 1;

export type InputPanelProps = {
  promptDraft: string;
  promptDraftCursorOffset: number;
  pendingPromptImageAttachments?: readonly UserPromptImageAttachment[];
  selectedPromptContextReferenceTexts?: readonly string[];
  isPromptInputDisabled: boolean;
  promptInputHintOverride?: string;
  accentColor: string;
  modeLabel: string;
  modelIdentifier: string;
  reasoningEffortLabel: string;
  assistantResponseStatus: ConversationTurnStatus;
  isActiveTurnInterruptConfirmationArmed?: boolean;
  totalContextTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
  onPromptDraftEdited: (promptTextareaEdit: PromptTextareaEdit) => void;
  onPromptSubmitted: () => void;
  onNativeClipboardPasteRequested?: () => void | Promise<void>;
};

export function InputPanel(props: InputPanelProps): ReactNode {
  const pendingPromptImageAttachmentCount = props.pendingPromptImageAttachments?.length ?? 0;
  const isAssistantTurnActive = props.assistantResponseStatus === "streaming_assistant_response" ||
    props.assistantResponseStatus === "waiting_for_tool_approval";
  return (
    <box
      borderStyle="rounded"
      borderColor={props.accentColor}
      flexDirection="column"
      backgroundColor={chatScreenTheme.bg}
      flexShrink={0}
      marginX={2}
    >
      <box flexDirection="row" justifyContent="space-between" paddingX={1}>
        <text fg={props.accentColor}>
          {`[ ${glyphs.statusDot} ${props.modeLabel} ]`}
        </text>
        <text fg={chatScreenTheme.textMuted}>
          {`[ ${props.modelIdentifier} · ${props.reasoningEffortLabel} ]`}
        </text>
      </box>
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
              cursorCharacter=" "
              shouldRenderPromptDraftOnSingleLine={false}
            />
          ) : (
            <PromptTextarea
              promptDraft={props.promptDraft}
              promptDraftCursorOffset={props.promptDraftCursorOffset}
              isFocused={true}
              onPromptDraftEdited={props.onPromptDraftEdited}
              onPromptSubmitted={props.onPromptSubmitted}
              onNativeClipboardPasteRequested={props.onNativeClipboardPasteRequested}
            />
          )}
        </box>
      </box>
      <box
        backgroundColor={chatScreenTheme.bg}
        flexDirection="row"
        justifyContent="space-between"
        paddingX={1}
      >
        {isAssistantTurnActive ? (
          <box flexDirection="row" gap={1} minWidth={0} overflow="hidden">
            <SnakeAnimationIndicator />
          </box>
        ) : pendingPromptImageAttachmentCount > 0 ? (
          <text fg={chatScreenTheme.textMuted} truncate={true} wrapMode="none">
            {`${pendingPromptImageAttachmentCount} image${pendingPromptImageAttachmentCount === 1 ? "" : "s"} attached · backspace removes last`}
          </text>
        ) : props.promptInputHintOverride !== undefined ? (
          <text fg={chatScreenTheme.textMuted} truncate={true} wrapMode="none">{props.promptInputHintOverride}</text>
        ) : <text />}
        <ContextWindowMeter
          totalTokensUsed={props.totalContextTokensUsed}
          contextWindowTokenCapacity={props.contextWindowTokenCapacity}
        />
      </box>
    </box>
  );
}
