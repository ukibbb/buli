import type { ReactNode } from "react";
import type { AssistantResponseStatus } from "../chatScreenState.ts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// Single-row degraded replacement for InputPanel used at minimumTerminalSizeTier.
// Drops every secondary element (mode chip, model chip, help footer, context
// meter, snake spinner) so the prompt caret and draft stay visible even when
// the terminal collapses to ~6 rows.
//
// Exported row count is the source of truth for ChatScreen's responsive
// budgeting math — keep it in sync with the rendered output below.
export const MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT = 1;

export type MinimumHeightPromptStripProps = {
  promptDraft: string;
  isPromptInputDisabled: boolean;
  assistantResponseStatus: AssistantResponseStatus;
};

export function MinimumHeightPromptStrip(props: MinimumHeightPromptStripProps): ReactNode {
  const isStreamingResponse = props.assistantResponseStatus === "streaming_assistant_response";
  if (isStreamingResponse) {
    return (
      <box
        backgroundColor={chatScreenTheme.surfaceOne}
        flexDirection="row"
        paddingX={1}
        flexShrink={0}
      >
        <text fg={chatScreenTheme.textMuted}>{"… working"}</text>
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
    >
      <text fg={chatScreenTheme.accentGreen}>
        <b>{">"}</b>
      </text>
      <text fg={chatScreenTheme.textPrimary}>
        {`${props.promptDraft}${cursorCharacter}`}
      </text>
    </box>
  );
}
