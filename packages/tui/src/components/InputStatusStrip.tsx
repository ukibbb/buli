import { memo, type ReactNode } from "react";
import type { ConversationTurnStatus } from "@buli/contracts";
import type { ConversationSessionCompactionStatus } from "@buli/chat-app-controller";
import { TextAttributes } from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ContextWindowMeter } from "./ContextWindowMeter.tsx";
import { resolveReasoningEffortColor } from "./resolveReasoningEffortColor.ts";
import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";
import { readChatScreenKeyboardShortcutCatalogEntry } from "../keyboard/chatScreenKeyboardShortcutCatalog.ts";

// One visible footer row plus one bottom gap below the input frame.
export const INPUT_STATUS_STRIP_ROW_COUNT = 2;

const assistantModeCycleShortcut = readChatScreenKeyboardShortcutCatalogEntry("assistant_mode_cycle");

export type InputStatusStripProps = {
  assistantResponseStatus: ConversationTurnStatus;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  queuedPromptCount: number;
  promptInputHintOverride?: string | undefined;
  accentColor: string;
  shortModeLabel: string;
  nextShortModeLabel: string;
  nextModeAccentColor: string;
  modelIdentifier: string;
  reasoningEffortLabel: string;
  totalContextTokensUsed: number | undefined;
  contextMeterTokenLimit: number | undefined;
};

function InputStatusStripComponent(props: InputStatusStripProps): ReactNode {
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
          contextMeterTokenLimit={props.contextMeterTokenLimit}
        />
      </box>
    </box>
  );
}

function areInputStatusStripPropsEqual(previousProps: InputStatusStripProps, nextProps: InputStatusStripProps): boolean {
  return previousProps.assistantResponseStatus === nextProps.assistantResponseStatus &&
    areConversationSessionCompactionStatusesEqual(
      previousProps.conversationSessionCompactionStatus,
      nextProps.conversationSessionCompactionStatus,
    ) &&
    previousProps.queuedPromptCount === nextProps.queuedPromptCount &&
    previousProps.promptInputHintOverride === nextProps.promptInputHintOverride &&
    previousProps.accentColor === nextProps.accentColor &&
    previousProps.shortModeLabel === nextProps.shortModeLabel &&
    previousProps.nextShortModeLabel === nextProps.nextShortModeLabel &&
    previousProps.nextModeAccentColor === nextProps.nextModeAccentColor &&
    previousProps.modelIdentifier === nextProps.modelIdentifier &&
    previousProps.reasoningEffortLabel === nextProps.reasoningEffortLabel &&
    previousProps.totalContextTokensUsed === nextProps.totalContextTokensUsed &&
    previousProps.contextMeterTokenLimit === nextProps.contextMeterTokenLimit;
}

function areConversationSessionCompactionStatusesEqual(
  previousStatus: ConversationSessionCompactionStatus,
  nextStatus: ConversationSessionCompactionStatus,
): boolean {
  if (previousStatus.step !== nextStatus.step) {
    return false;
  }

  if (previousStatus.step === "compacting" && nextStatus.step === "compacting") {
    return previousStatus.source === nextStatus.source;
  }

  if (previousStatus.step === "failed" && nextStatus.step === "failed") {
    return previousStatus.errorMessage === nextStatus.errorMessage;
  }

  return true;
}

function renderLeftCluster(props: InputStatusStripProps): ReactNode {
  const isAssistantTurnActive =
    props.assistantResponseStatus === "streaming_assistant_response" ||
    props.assistantResponseStatus === "waiting_for_tool_approval";
  if (
    props.conversationSessionCompactionStatus.step === "compacting" &&
    props.conversationSessionCompactionStatus.source === "manual"
  ) {
    return renderManualCompactingLeftCluster({
      queuedPromptCount: props.queuedPromptCount,
    });
  }
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

function renderManualCompactingLeftCluster(input: {
  queuedPromptCount: number;
}): ReactNode {
  return (
    <>
      <SnakeAnimationIndicator variant="sixCell" />
      <text fg={chatScreenTheme.textMuted} truncate={true} wrapMode="none">
        Compacting history...
      </text>
      {input.queuedPromptCount > 0 ? (
        <text fg={chatScreenTheme.textMuted} truncate={true} wrapMode="none">
          {`Queued: ${input.queuedPromptCount}`}
        </text>
      ) : null}
    </>
  );
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
  const assistantModeCycleKeycapLabel = assistantModeCycleShortcut.keycapLabel ?? assistantModeCycleShortcut.helpLabel;

  return (
    <text wrapMode="none" truncate={true}>
      <span fg={props.accentColor} attributes={TextAttributes.UNDERLINE}>{props.shortModeLabel}</span>
      <span fg={chatScreenTheme.textDim}>{"  "}</span>
      <span fg={chatScreenTheme.accentCyan}>{props.modelIdentifier}</span>
      <span fg={chatScreenTheme.textDim}>{" / "}</span>
      <span fg={resolveReasoningEffortColor(props.reasoningEffortLabel)}>{props.reasoningEffortLabel}</span>
      <span fg={chatScreenTheme.textDim}>{"   "}</span>
      <span fg={chatScreenTheme.bg} bg={props.nextModeAccentColor}>{` ${assistantModeCycleKeycapLabel} `}</span>
      <span fg={chatScreenTheme.textMuted}>{` ${props.nextShortModeLabel}`}</span>
    </text>
  );
}

export const InputStatusStrip = memo(InputStatusStripComponent, areInputStatusStripPropsEqual);
