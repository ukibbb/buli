import type { ReactNode } from "react";
import type { AssistantReasoningConversationMessagePart } from "@buli/contracts";
import { ReasoningCollapsedChip } from "../ReasoningCollapsedChip.tsx";
import { ReasoningStreamBlock } from "../ReasoningStreamBlock.tsx";

export function ReasoningPartView(props: {
  assistantReasoningConversationMessagePart: AssistantReasoningConversationMessagePart;
}): ReactNode {
  if (props.assistantReasoningConversationMessagePart.partStatus === "streaming") {
    return (
      <ReasoningStreamBlock
        reasoningSummaryText={props.assistantReasoningConversationMessagePart.reasoningSummaryText}
        reasoningStartedAtMs={props.assistantReasoningConversationMessagePart.reasoningStartedAtMs}
      />
    );
  }

  return (
    <ReasoningCollapsedChip
      reasoningDurationMs={props.assistantReasoningConversationMessagePart.reasoningDurationMs ?? 0}
      reasoningTokenCount={props.assistantReasoningConversationMessagePart.reasoningTokenCount}
    />
  );
}
