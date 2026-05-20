import { useEffect, useState, type ReactNode } from "react";
import type { AssistantReasoningConversationMessagePart } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SnakeAnimationIndicator } from "../SnakeAnimationIndicator.tsx";
import { ThinkingStatusLine } from "../ThinkingStatusLine.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";

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

  if (
    props.assistantReasoningConversationMessagePart.partStatus === "streaming" &&
    (!isReasoningSummaryExpanded || !visibleReasoningSummaryText)
  ) {
    return (
      <ThinkingStatusLine
        thinkingStartedAtMs={props.assistantReasoningConversationMessagePart.reasoningStartedAtMs}
        thinkingTopicText={reasoningSummaryTitle ?? undefined}
      />
    );
  }

  return (
    <ReasoningSummaryCard
      assistantReasoningConversationMessagePart={props.assistantReasoningConversationMessagePart}
      isReasoningSummaryExpanded={isReasoningSummaryExpanded}
      onReasoningSummaryExpansionToggle={() => {
        if (visibleReasoningSummaryText.length === 0) {
          return;
        }

        setIsReasoningSummaryExpanded((currentIsReasoningSummaryExpanded) => !currentIsReasoningSummaryExpanded);
      }}
      reasoningSummaryTitle={reasoningSummaryTitle ?? undefined}
      visibleReasoningSummaryText={visibleReasoningSummaryText}
    />
  );
}

function normalizeVisibleReasoningSummaryText(reasoningSummaryText: string): string {
  return reasoningSummaryText.replaceAll("[REDACTED]", "").trim();
}

function readReasoningSummaryTitle(visibleReasoningSummaryText: string): string | undefined {
  const titleMatch = visibleReasoningSummaryText.trimStart().match(/^\*\*([^*\n]+)\*\*/);
  const titleText = titleMatch?.[1]?.trim();
  return titleText && titleText.length > 0 ? titleText : undefined;
}

function ReasoningSummaryCard(props: {
  assistantReasoningConversationMessagePart: AssistantReasoningConversationMessagePart;
  isReasoningSummaryExpanded: boolean;
  onReasoningSummaryExpansionToggle: () => void;
  reasoningSummaryTitle?: string | undefined;
  visibleReasoningSummaryText: string;
}): ReactNode {
  const hasVisibleReasoningSummaryText = props.visibleReasoningSummaryText.length > 0;
  return (
    <SurfaceCard
      accentColor={chatScreenTheme.textDim}
      borderColor={chatScreenTheme.borderSubtle}
      headerLeft={
        <ReasoningSummaryDisclosureHeader
          assistantReasoningConversationMessagePart={props.assistantReasoningConversationMessagePart}
          hasVisibleReasoningSummaryText={hasVisibleReasoningSummaryText}
          isReasoningSummaryExpanded={props.isReasoningSummaryExpanded}
          onReasoningSummaryExpansionToggle={props.onReasoningSummaryExpansionToggle}
          reasoningSummaryTitle={props.reasoningSummaryTitle}
        />
      }
      headerRight={props.assistantReasoningConversationMessagePart.partStatus === "streaming"
        ? undefined
        : (
          <text fg={chatScreenTheme.textDim} wrapMode="none">
            {formatReasoningSummaryMetadata(props.assistantReasoningConversationMessagePart)}
          </text>
        )}
      bodyContent={
        props.isReasoningSummaryExpanded && hasVisibleReasoningSummaryText
          ? <ReasoningSummaryTextLines visibleReasoningSummaryText={props.visibleReasoningSummaryText} />
          : undefined
      }
    />
  );
}

function ReasoningSummaryDisclosureHeader(props: {
  assistantReasoningConversationMessagePart: AssistantReasoningConversationMessagePart;
  hasVisibleReasoningSummaryText: boolean;
  isReasoningSummaryExpanded: boolean;
  onReasoningSummaryExpansionToggle: () => void;
  reasoningSummaryTitle?: string | undefined;
}): ReactNode {
  if (props.assistantReasoningConversationMessagePart.partStatus === "streaming") {
    return (
      <box onMouseDown={() => props.onReasoningSummaryExpansionToggle()}>
        <SnakeAnimationIndicator />
      </box>
    );
  }

  const disclosureText = props.isReasoningSummaryExpanded ? "[-]" : "[+]";
  const actionHintText = props.isReasoningSummaryExpanded ? "click to hide content" : "click to show content";
  return (
    <box
      flexDirection="row"
      onMouseDown={() => props.onReasoningSummaryExpansionToggle()}
      width="100%"
    >
      <text truncate={true} wrapMode="none" width="100%">
        {props.hasVisibleReasoningSummaryText ? <span fg={chatScreenTheme.accentCyan}>{disclosureText}</span> : null}
        <span fg={chatScreenTheme.textMuted}>{`${props.hasVisibleReasoningSummaryText ? " " : ""}${formatReasoningSummaryTitle(props)}`}</span>
        {props.hasVisibleReasoningSummaryText ? <span fg={chatScreenTheme.textDim}>{` - ${actionHintText}`}</span> : null}
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
): string {
  const durationOrStatusLabel = assistantReasoningConversationMessagePart.partStatus === "interrupted"
    ? "interrupted"
    : `${((assistantReasoningConversationMessagePart.reasoningDurationMs ?? 0) / 1000).toFixed(1)}s`;
  return [
    durationOrStatusLabel,
    assistantReasoningConversationMessagePart.reasoningTokenCount === undefined
      ? "reasoning tokens unavailable"
      : `${assistantReasoningConversationMessagePart.reasoningTokenCount} reasoning tok`,
  ].join(" · ");
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
