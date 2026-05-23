import type { ReactNode } from "react";
import type { ConversationTurnStatus } from "@buli/contracts";
import { TextAttributes } from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ContextWindowMeter } from "./ContextWindowMeter.tsx";
import { resolveReasoningEffortColor } from "./resolveReasoningEffortColor.ts";
import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";

// The strip lives directly under the input frame and reuses the same outer
// column span: marginX={2} matches the frame's outer margin, paddingX={2}
// matches the frame's border (1 cell) plus internal padding (1 cell) so the
// strip content area aligns visually with the prompt content area inside the
// frame. A 1-row marginBottom leaves a breathing gap between the chip line
// and whatever the host shell renders below (tmux bar, prompt, etc.) — the
// strip's effective row footprint is 2 (1 content + 1 gap) which is what
// INPUT_STATUS_STRIP_ROW_COUNT must report so the view-model's row budget
// keeps the chip line visible above the terminal floor.
export const INPUT_STATUS_STRIP_ROW_COUNT = 2;

export type InputStatusStripProps = {
  assistantResponseStatus: ConversationTurnStatus;
  pendingPromptImageAttachmentCount: number;
  promptInputHintOverride?: string | undefined;
  accentColor: string;
  shortModeLabel: string;
  nextShortModeLabel: string;
  nextModeAccentColor: string;
  modelIdentifier: string;
  reasoningEffortLabel: string;
  totalContextTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
};

export function InputStatusStrip(props: InputStatusStripProps): ReactNode {
  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      flexShrink={0}
      marginX={2}
      marginBottom={1}
      paddingX={2}
    >
      <box flexDirection="row" gap={1} minWidth={0} overflow="hidden">
        {renderLeftCluster(props)}
      </box>
      <box flexShrink={0}>
        <ContextWindowMeter
          totalTokensUsed={props.totalContextTokensUsed}
          contextWindowTokenCapacity={props.contextWindowTokenCapacity}
        />
      </box>
    </box>
  );
}

function renderLeftCluster(props: InputStatusStripProps): ReactNode {
  const isAssistantTurnActive =
    props.assistantResponseStatus === "streaming_assistant_response" ||
    props.assistantResponseStatus === "waiting_for_tool_approval";
  if (isAssistantTurnActive) {
    return <SnakeAnimationIndicator variant="sixCell" />;
  }
  if (props.pendingPromptImageAttachmentCount > 0) {
    return renderPendingImagesHint(props.pendingPromptImageAttachmentCount);
  }
  if (props.promptInputHintOverride !== undefined) {
    return (
      <text fg={chatScreenTheme.textMuted} truncate={true} wrapMode="none">
        {props.promptInputHintOverride}
      </text>
    );
  }
  return renderIdleLeftCluster(props);
}

function renderPendingImagesHint(pendingPromptImageAttachmentCount: number): ReactNode {
  const imageNoun = pendingPromptImageAttachmentCount === 1 ? "image" : "images";
  return (
    <text fg={chatScreenTheme.textMuted} truncate={true} wrapMode="none">
      {`${pendingPromptImageAttachmentCount} ${imageNoun} attached · delete placeholder to remove`}
    </text>
  );
}

function renderIdleLeftCluster(props: InputStatusStripProps): ReactNode {
  return (
    <text wrapMode="none" truncate={true}>
      <span fg={props.accentColor} attributes={TextAttributes.UNDERLINE}>{props.shortModeLabel}</span>
      <span fg={chatScreenTheme.textDim}>{"  "}</span>
      <span fg={chatScreenTheme.accentPurple}>{props.modelIdentifier}</span>
      <span fg={chatScreenTheme.textDim}>{" / "}</span>
      <span fg={resolveReasoningEffortColor(props.reasoningEffortLabel)}>{props.reasoningEffortLabel}</span>
      <span fg={chatScreenTheme.textDim}>{"   "}</span>
      <span fg={chatScreenTheme.bg} bg={props.nextModeAccentColor}>{" tab "}</span>
      <span fg={chatScreenTheme.textMuted}>{` ${props.nextShortModeLabel}`}</span>
    </text>
  );
}
