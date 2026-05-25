import type { ReactNode } from "react";
import type { ConversationTurnStatus } from "@buli/contracts";
import { TextAttributes } from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ContextWindowMeter } from "./ContextWindowMeter.tsx";
import { resolveReasoningEffortColor } from "./resolveReasoningEffortColor.ts";
import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";

// One visible footer row plus one bottom gap below the input frame.
export const INPUT_STATUS_STRIP_ROW_COUNT = 2;

export type InputStatusStripProps = {
  assistantResponseStatus: ConversationTurnStatus;
  queuedPromptCount: number;
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
    return renderActiveAssistantTurnLeftCluster(props.queuedPromptCount);
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

function renderActiveAssistantTurnLeftCluster(queuedPromptCount: number): ReactNode {
  return (
    <>
      <SnakeAnimationIndicator variant="sixCell" />
      {queuedPromptCount > 0 ? (
        <text fg={chatScreenTheme.textMuted} truncate={true} wrapMode="none">
          {`Queued: ${queuedPromptCount}`}
        </text>
      ) : null}
    </>
  );
}

function renderIdleLeftCluster(props: InputStatusStripProps): ReactNode {
  return (
    <text wrapMode="none" truncate={true}>
      <span fg={props.accentColor} attributes={TextAttributes.UNDERLINE}>{props.shortModeLabel}</span>
      <span fg={chatScreenTheme.textDim}>{"  "}</span>
      <span fg={chatScreenTheme.accentCyan}>{props.modelIdentifier}</span>
      <span fg={chatScreenTheme.textDim}>{" / "}</span>
      <span fg={resolveReasoningEffortColor(props.reasoningEffortLabel)}>{props.reasoningEffortLabel}</span>
      <span fg={chatScreenTheme.textDim}>{"   "}</span>
      <span fg={chatScreenTheme.bg} bg={props.nextModeAccentColor}>{" tab "}</span>
      <span fg={chatScreenTheme.textMuted}>{` ${props.nextShortModeLabel}`}</span>
    </text>
  );
}
