import type { ReactNode } from "react";
import type { AssistantReasoningConversationMessagePart } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ReasoningCollapsedChip } from "../ReasoningCollapsedChip.tsx";
import { ThinkingStatusLine } from "../ThinkingStatusLine.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";

export function ReasoningPartView(props: {
  assistantReasoningConversationMessagePart: AssistantReasoningConversationMessagePart;
  isReasoningSummaryVisible: boolean;
}): ReactNode {
  const visibleReasoningSummaryText = normalizeVisibleReasoningSummaryText(
    props.assistantReasoningConversationMessagePart.reasoningSummaryText,
  );

  if (
    props.assistantReasoningConversationMessagePart.partStatus === "streaming" &&
    (!props.isReasoningSummaryVisible || !visibleReasoningSummaryText)
  ) {
    return (
      <ThinkingStatusLine thinkingStartedAtMs={props.assistantReasoningConversationMessagePart.reasoningStartedAtMs} />
    );
  }

  if (props.isReasoningSummaryVisible && visibleReasoningSummaryText) {
    return (
      <box flexDirection="column" width="100%">
        {props.assistantReasoningConversationMessagePart.partStatus === "streaming" ? (
          <box marginBottom={1}>
            <ThinkingStatusLine thinkingStartedAtMs={props.assistantReasoningConversationMessagePart.reasoningStartedAtMs} />
          </box>
        ) : null}
        <ReasoningSummaryBlock
          assistantReasoningConversationMessagePart={props.assistantReasoningConversationMessagePart}
          visibleReasoningSummaryText={visibleReasoningSummaryText}
        />
      </box>
    );
  }

  return (
    <ReasoningCollapsedChip
      reasoningDurationMs={props.assistantReasoningConversationMessagePart.reasoningDurationMs ?? 0}
      reasoningTokenCount={props.assistantReasoningConversationMessagePart.reasoningTokenCount}
    />
  );
}

function normalizeVisibleReasoningSummaryText(reasoningSummaryText: string): string {
  return reasoningSummaryText.replaceAll("[REDACTED]", "").trim();
}

function ReasoningSummaryBlock(props: {
  assistantReasoningConversationMessagePart: AssistantReasoningConversationMessagePart;
  visibleReasoningSummaryText: string;
}): ReactNode {
  return (
    <SurfaceCard
      accentColor={chatScreenTheme.textDim}
      borderColor={chatScreenTheme.borderSubtle}
      headerLeft={
        <text>
          <i fg={chatScreenTheme.textMuted}>{"_Thinking:_"}</i>
        </text>
      }
      headerRight={
        <text fg={chatScreenTheme.textDim} wrapMode="none">
          {formatReasoningSummaryMetadata(props.assistantReasoningConversationMessagePart)}
        </text>
      }
      bodyContent={<ReasoningSummaryTextLines visibleReasoningSummaryText={props.visibleReasoningSummaryText} />}
    />
  );
}

function formatReasoningSummaryMetadata(
  assistantReasoningConversationMessagePart: AssistantReasoningConversationMessagePart,
): string {
  if (assistantReasoningConversationMessagePart.partStatus === "streaming") {
    return "streaming";
  }

  if (assistantReasoningConversationMessagePart.partStatus === "interrupted") {
    return "interrupted";
  }

  return [
    `${((assistantReasoningConversationMessagePart.reasoningDurationMs ?? 0) / 1000).toFixed(1)}s`,
    assistantReasoningConversationMessagePart.reasoningTokenCount === undefined
      ? "reasoning tokens pending"
      : `${assistantReasoningConversationMessagePart.reasoningTokenCount} reasoning tok`,
  ].join(" - ");
}

function ReasoningSummaryTextLines(props: { visibleReasoningSummaryText: string }): ReactNode {
  return (
    <box flexDirection="column" width="100%">
      {props.visibleReasoningSummaryText.split("\n").map((reasoningSummaryLineText, index) =>
        reasoningSummaryLineText === "" ? (
          <box key={`reasoning-blank-${index}`} height={1} />
        ) : (
          <text fg={chatScreenTheme.textMuted} key={`reasoning-line-${index}`}>{reasoningSummaryLineText}</text>
        ),
      )}
    </box>
  );
}
