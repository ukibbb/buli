import type { ReactNode } from "react";
import type { AssistantTurnSummaryConversationMessagePart, TokenUsage } from "@buli/contracts";
import { calculateContextTokensUsedFromTokenUsage } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { formatCompactTokenCount } from "../formatCompactTokenCount.ts";

export function AssistantTurnSummaryPartView(props: {
  assistantTurnSummaryConversationMessagePart: AssistantTurnSummaryConversationMessagePart;
}): ReactNode {
  return (
    <box paddingX={1} width="100%">
      <text fg={chatScreenTheme.textDim} wrapMode="word" width="100%">
        {formatAssistantTurnSummary(props.assistantTurnSummaryConversationMessagePart)}
      </text>
    </box>
  );
}

function formatAssistantTurnSummary(
  assistantTurnSummaryConversationMessagePart: AssistantTurnSummaryConversationMessagePart,
): string {
  return [
    assistantTurnSummaryConversationMessagePart.modelDisplayName,
    assistantTurnSummaryConversationMessagePart.assistantOperatingMode,
    formatAssistantTurnDurationMs(assistantTurnSummaryConversationMessagePart.turnDurationMs),
    assistantTurnSummaryConversationMessagePart.usage
      ? formatAssistantTurnUsage(assistantTurnSummaryConversationMessagePart.usage)
      : undefined,
  ].filter((summaryLabel): summaryLabel is string => summaryLabel !== undefined && summaryLabel.length > 0).join(" · ");
}

function formatAssistantTurnDurationMs(turnDurationMs: number): string {
  return turnDurationMs < 1000 ? `${turnDurationMs}ms` : `${(turnDurationMs / 1000).toFixed(1)}s`;
}

function formatAssistantTurnUsage(usage: TokenUsage): string {
  const cacheTokenCount = usage.cache.read + usage.cache.write;
  const totalTokenCount = calculateContextTokensUsedFromTokenUsage(usage);
  return [
    `${formatCompactTokenCount(totalTokenCount)} tokens`,
    `${formatCompactTokenCount(usage.input)} in`,
    `${formatCompactTokenCount(usage.output)} out`,
    usage.reasoning > 0 ? `${formatCompactTokenCount(usage.reasoning)} reasoning` : undefined,
    cacheTokenCount > 0 ? `${formatCompactTokenCount(cacheTokenCount)} cached` : undefined,
  ].filter((usageLabel): usageLabel is string => usageLabel !== undefined).join(", ");
}
