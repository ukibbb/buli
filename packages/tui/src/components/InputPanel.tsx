import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import type { ConversationTurnStatus } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ContextWindowMeter } from "./ContextWindowMeter.tsx";
import { glyphs } from "./glyphs.ts";
import { PromptDraftText } from "./PromptDraftText.tsx";
import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";

// Pen frame HOeet. Owns three stacked rows: a header strip with mode + model
// chips, a body with the prompt draft and caret, and a footer that shows the
// working indicator while streaming, a contextual override message when one is
// supplied, or only the context meter when idle.
//
// Exported row count = 2 (rounded border) + 1 (header) + 1 (body) + 1 (footer).
// It is the source of truth for ChatScreen's responsive budgeting math — keep
// it in sync with the rendered output below.
export const INPUT_PANEL_NATURAL_ROW_COUNT = 5;

export type InputPanelProps = {
  promptDraft: string;
  promptDraftCursorOffset: number;
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
};

export function InputPanel(props: InputPanelProps): ReactNode {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (props.isPromptInputDisabled) {
      return;
    }

    const id = setInterval(() => {
      setFrameIndex((prev) => prev + 1);
    }, 500);
    return () => clearInterval(id);
  }, [props.isPromptInputDisabled]);

  const isCursorVisible = frameIndex % 2 === 0;
  const cursorCharacter = !props.isPromptInputDisabled && isCursorVisible ? "█" : " ";
  const isAssistantTurnActive = props.assistantResponseStatus === "streaming_assistant_response" ||
    props.assistantResponseStatus === "waiting_for_tool_approval";
  const activeTurnStatusText = props.isActiveTurnInterruptConfirmationArmed
    ? "esc again to stop"
    : props.assistantResponseStatus === "waiting_for_tool_approval"
    ? "approval needed · esc esc to stop"
    : "working… esc esc to stop";

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
      <box flexDirection="row" paddingX={1} gap={1}>
        <text fg={props.accentColor}>
          <b>{">"}</b>
        </text>
        <box flexGrow={1} minWidth={0} overflow="hidden" width="100%">
          <PromptDraftText
            promptDraft={props.promptDraft}
            promptDraftCursorOffset={props.promptDraftCursorOffset}
            selectedPromptContextReferenceTexts={props.selectedPromptContextReferenceTexts}
            cursorCharacter={cursorCharacter}
            shouldRenderPromptDraftOnSingleLine={true}
          />
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
            <text fg={chatScreenTheme.textMuted} truncate={true} wrapMode="none">{activeTurnStatusText}</text>
          </box>
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
