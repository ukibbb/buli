import type { ReactNode } from "react";
import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import { ErrorBannerBlock } from "./behavior/ErrorBannerBlock.tsx";
import { IncompleteResponseNoticeBlock } from "./behavior/IncompleteResponseNoticeBlock.tsx";
import { PlanProposalBlock } from "./behavior/PlanProposalBlock.tsx";
import { RateLimitNoticeBlock } from "./behavior/RateLimitNoticeBlock.tsx";
import { TurnFooter } from "./TurnFooter.tsx";
import { UserPromptBlock } from "./UserPromptBlock.tsx";
import { AssistantTextPartView } from "./messageParts/AssistantTextPartView.tsx";
import { ReasoningPartView } from "./messageParts/ReasoningPartView.tsx";
import { ToolCallPartView } from "./messageParts/ToolCallPartView.tsx";

function ConversationMessagePartView(props: { conversationMessagePart: ConversationMessagePart }): ReactNode {
  const { conversationMessagePart } = props;
  if (conversationMessagePart.partKind === "user_text") {
    return <UserPromptBlock promptText={conversationMessagePart.text} />;
  }
  if (conversationMessagePart.partKind === "assistant_text") {
    return <AssistantTextPartView assistantTextConversationMessagePart={conversationMessagePart} />;
  }
  if (conversationMessagePart.partKind === "assistant_reasoning") {
    return <ReasoningPartView assistantReasoningConversationMessagePart={conversationMessagePart} />;
  }
  if (conversationMessagePart.partKind === "assistant_tool_call") {
    return <ToolCallPartView assistantToolCallConversationMessagePart={conversationMessagePart} />;
  }
  if (conversationMessagePart.partKind === "assistant_plan_proposal") {
    return <PlanProposalBlock planTitle={conversationMessagePart.planTitle} planSteps={conversationMessagePart.planSteps} />;
  }
  if (conversationMessagePart.partKind === "assistant_rate_limit_notice") {
    return (
      <RateLimitNoticeBlock
        retryAfterSeconds={conversationMessagePart.retryAfterSeconds}
        limitExplanation={conversationMessagePart.limitExplanation}
        noticeStartedAtMs={conversationMessagePart.noticeStartedAtMs}
      />
    );
  }
  if (conversationMessagePart.partKind === "assistant_incomplete_notice") {
    return <IncompleteResponseNoticeBlock incompleteReason={conversationMessagePart.incompleteReason} />;
  }
  if (conversationMessagePart.partKind === "assistant_error_notice") {
    return <ErrorBannerBlock errorText={conversationMessagePart.errorText} />;
  }
  return (
    <TurnFooter
      modelDisplayName={conversationMessagePart.modelDisplayName}
      turnDurationMs={conversationMessagePart.turnDurationMs}
      usage={conversationMessagePart.usage}
    />
  );
}

export function ConversationMessageRow(props: {
  conversationMessage: ConversationMessage;
  conversationMessageParts: readonly ConversationMessagePart[];
}): ReactNode {
  return (
    <box flexDirection="column" width="100%">
      {props.conversationMessageParts.map((conversationMessagePart, index) => (
        <box
          flexDirection="column"
          key={conversationMessagePart.id}
          marginTop={index === 0 ? 0 : 1}
          width="100%"
        >
          <ConversationMessagePartView conversationMessagePart={conversationMessagePart} />
        </box>
      ))}
    </box>
  );
}
