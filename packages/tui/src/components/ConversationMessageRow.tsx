import type { ReactNode } from "react";
import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import { ErrorBannerBlock } from "./behavior/ErrorBannerBlock.tsx";
import { IncompleteResponseNoticeBlock } from "./behavior/IncompleteResponseNoticeBlock.tsx";
import { PlanProposalBlock } from "./behavior/PlanProposalBlock.tsx";
import { RateLimitNoticeBlock } from "./behavior/RateLimitNoticeBlock.tsx";
import { TurnFooter } from "./TurnFooter.tsx";
import { ThinkingStatusLine } from "./ThinkingStatusLine.tsx";
import { UserImageAttachmentBlock } from "./UserImageAttachmentBlock.tsx";
import { UserPromptBlock } from "./UserPromptBlock.tsx";
import { AssistantLearningSequencePartView } from "./messageParts/AssistantLearningSequencePartView.tsx";
import { AssistantTextPartView } from "./messageParts/AssistantTextPartView.tsx";
import { ReasoningPartView } from "./messageParts/ReasoningPartView.tsx";
import { ToolCallPartView } from "./messageParts/ToolCallPartView.tsx";

function ConversationMessagePartView(props: {
  conversationMessagePart: ConversationMessagePart;
  isReasoningSummaryVisible: boolean;
  horizontalRuleColor: string;
  terminalColumnCount?: number | undefined;
}): ReactNode {
  const { conversationMessagePart } = props;
  if (conversationMessagePart.partKind === "user_text") {
    return <UserPromptBlock promptText={conversationMessagePart.text} />;
  }
  if (conversationMessagePart.partKind === "user_image_attachment") {
    return <UserImageAttachmentBlock attachment={conversationMessagePart.attachment} />;
  }
  if (conversationMessagePart.partKind === "assistant_text") {
    return (
      <AssistantTextPartView
        assistantTextConversationMessagePart={conversationMessagePart}
        horizontalRuleColor={props.horizontalRuleColor}
        terminalColumnCount={props.terminalColumnCount}
      />
    );
  }
  if (conversationMessagePart.partKind === "assistant_reasoning") {
    return (
      <ReasoningPartView
        assistantReasoningConversationMessagePart={conversationMessagePart}
        isReasoningSummaryVisible={props.isReasoningSummaryVisible}
      />
    );
  }
  if (conversationMessagePart.partKind === "assistant_tool_call") {
    return <ToolCallPartView assistantToolCallConversationMessagePart={conversationMessagePart} />;
  }
  if (conversationMessagePart.partKind === "assistant_plan_proposal") {
    return <PlanProposalBlock planTitle={conversationMessagePart.planTitle} planSteps={conversationMessagePart.planSteps} />;
  }
  if (conversationMessagePart.partKind === "assistant_learning_sequence") {
    return <AssistantLearningSequencePartView assistantLearningSequenceConversationMessagePart={conversationMessagePart} />;
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
  if (conversationMessagePart.partKind === "assistant_interrupted_notice") {
    return <ErrorBannerBlock titleText="Interrupted" errorText={conversationMessagePart.interruptionReason} />;
  }
  return (
    <TurnFooter
      modelDisplayName={conversationMessagePart.modelDisplayName}
      turnDurationMs={conversationMessagePart.turnDurationMs}
      usage={conversationMessagePart.usage}
    />
  );
}

export type ConversationMessageRowProps = {
  conversationMessage: ConversationMessage;
  conversationMessageParts: readonly ConversationMessagePart[];
  isReasoningSummaryVisible: boolean;
  horizontalRuleColor: string;
  terminalColumnCount?: number | undefined;
};

export function ConversationMessageRow(props: ConversationMessageRowProps): ReactNode {
  const shouldShowEmptyAssistantThinkingLine =
    props.conversationMessage.role === "assistant" &&
    props.conversationMessage.messageStatus === "streaming" &&
    props.conversationMessageParts.length === 0;

  return (
    <box flexDirection="column" width="100%">
      {shouldShowEmptyAssistantThinkingLine ? (
        <ThinkingStatusLine thinkingStartedAtMs={props.conversationMessage.createdAtMs} />
      ) : null}
      {props.conversationMessageParts.map((conversationMessagePart, index) => (
        <box
          flexDirection="column"
          flexShrink={0}
          key={conversationMessagePart.id}
          marginTop={index === 0 ? 0 : 1}
          width="100%"
        >
          <ConversationMessagePartView
            conversationMessagePart={conversationMessagePart}
            isReasoningSummaryVisible={props.isReasoningSummaryVisible}
            horizontalRuleColor={props.horizontalRuleColor}
            terminalColumnCount={props.terminalColumnCount}
          />
        </box>
      ))}
    </box>
  );
}
