import { useEffect, useState, type ReactNode } from "react";
import type { AssistantReasoningConversationMessagePart } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { InlineSnakeAnimationIndicator } from "../SnakeAnimationIndicator.tsx";
import { createClickableControlMouseDownHandler } from "../primitives/clickableControl.ts";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { normalizeVisibleReasoningSummaryText, readReasoningSummaryTitle } from "./reasoningSummaryText.ts";

export function ReasoningPartView(props: {
  assistantReasoningConversationMessagePart: AssistantReasoningConversationMessagePart;
  isReasoningSummaryVisible: boolean;
}): ReactNode {
  const visibleReasoningSummaryText = normalizeVisibleReasoningSummaryText(
    props.assistantReasoningConversationMessagePart.reasoningSummaryText,
  );
  const reasoningSummaryTitle = readReasoningSummaryTitle(visibleReasoningSummaryText);
  const [isReasoningSummaryExpanded, setIsReasoningSummaryExpanded] = useState(props.isReasoningSummaryVisible);

  useEffect(() => {
    setIsReasoningSummaryExpanded(props.isReasoningSummaryVisible);
  }, [props.assistantReasoningConversationMessagePart.id, props.isReasoningSummaryVisible]);

  if (!props.isReasoningSummaryVisible || visibleReasoningSummaryText.length === 0) {
    return null;
  }

  return (
    <ReasoningSummaryCard
      assistantReasoningConversationMessagePart={props.assistantReasoningConversationMessagePart}
      isReasoningSummaryExpanded={isReasoningSummaryExpanded}
      onReasoningSummaryExpansionToggle={() => {
        setIsReasoningSummaryExpanded((currentIsReasoningSummaryExpanded) => !currentIsReasoningSummaryExpanded);
      }}
      reasoningSummaryTitle={reasoningSummaryTitle ?? undefined}
      visibleReasoningSummaryText={visibleReasoningSummaryText}
    />
  );
}

function ReasoningSummaryCard(props: {
  assistantReasoningConversationMessagePart: AssistantReasoningConversationMessagePart;
  isReasoningSummaryExpanded: boolean;
  onReasoningSummaryExpansionToggle: () => void;
  reasoningSummaryTitle?: string | undefined;
  visibleReasoningSummaryText: string;
}): ReactNode {
  return (
    <SurfaceCard
      accentColor={chatScreenTheme.textDim}
      borderColor={chatScreenTheme.borderSubtle}
      headerLeft={
        <ReasoningSummaryDisclosureHeader
          assistantReasoningConversationMessagePart={props.assistantReasoningConversationMessagePart}
          isReasoningSummaryExpanded={props.isReasoningSummaryExpanded}
          onReasoningSummaryExpansionToggle={props.onReasoningSummaryExpansionToggle}
          reasoningSummaryTitle={props.reasoningSummaryTitle}
        />
      }
      bodyContent={
        props.isReasoningSummaryExpanded
          ? <ReasoningSummaryTextLines visibleReasoningSummaryText={props.visibleReasoningSummaryText} />
          : undefined
      }
    />
  );
}

function ReasoningSummaryDisclosureHeader(props: {
  assistantReasoningConversationMessagePart: AssistantReasoningConversationMessagePart;
  isReasoningSummaryExpanded: boolean;
  onReasoningSummaryExpansionToggle: () => void;
  reasoningSummaryTitle?: string | undefined;
}): ReactNode {
  const disclosureText = props.isReasoningSummaryExpanded ? "[-]" : "[+]";
  const metadataLabel = formatReasoningSummaryMetadata(props.assistantReasoningConversationMessagePart);
  const isStreamingReasoning = props.assistantReasoningConversationMessagePart.partStatus === "streaming";
  return (
    <box
      flexDirection="row"
      onMouseDown={createClickableControlMouseDownHandler(props.onReasoningSummaryExpansionToggle)}
      width="100%"
    >
      <text selectable={false} wrapMode="word" width="100%">
        {isStreamingReasoning ? <InlineSnakeAnimationIndicator variant="eatingApple" /> : null}
        {isStreamingReasoning ? <span fg={chatScreenTheme.textDim}> </span> : null}
        <span fg={chatScreenTheme.accentCyan}>{disclosureText}</span>
        <span fg={chatScreenTheme.textMuted}>{` ${formatReasoningSummaryTitle(props)}`}</span>
        {metadataLabel ? <span fg={chatScreenTheme.textDim}>{` · ${metadataLabel}`}</span> : null}
      </text>
    </box>
  );
}

function formatReasoningSummaryTitle(input: {
  assistantReasoningConversationMessagePart: AssistantReasoningConversationMessagePart;
  reasoningSummaryTitle?: string | undefined;
}): string {
  const label = input.assistantReasoningConversationMessagePart.partStatus === "streaming" ? "Thinking" : "Thought";
  return input.reasoningSummaryTitle ? `${label}: ${input.reasoningSummaryTitle}` : label;
}

function formatReasoningSummaryMetadata(
  assistantReasoningConversationMessagePart: AssistantReasoningConversationMessagePart,
): string | undefined {
  if (assistantReasoningConversationMessagePart.partStatus === "interrupted") {
    return "interrupted";
  }

  if (assistantReasoningConversationMessagePart.reasoningDurationMs === undefined) {
    return undefined;
  }

  return `${(assistantReasoningConversationMessagePart.reasoningDurationMs / 1000).toFixed(1)}s`;
}

function ReasoningSummaryTextLines(props: { visibleReasoningSummaryText: string }): ReactNode {
  return (
    <box flexDirection="column" width="100%">
      {props.visibleReasoningSummaryText.split("\n").map((reasoningSummaryLineText, index) =>
        reasoningSummaryLineText === "" ? (
          <box key={`reasoning-blank-${index}`} height={1} />
        ) : (
          <text fg={chatScreenTheme.textMuted} key={`reasoning-line-${index}`} wrapMode="word" width="100%">{reasoningSummaryLineText}</text>
        ),
      )}
    </box>
  );
}
