import type { ReactNode } from "react";
import type {
  AssistantToolCallConversationMessagePart,
  AssistantWorkspacePatchConversationMessagePart,
  ConversationMessage,
  ConversationMessagePart,
  WorkspacePatch,
} from "@buli/contracts";
import { ErrorBannerBlock } from "./behavior/ErrorBannerBlock.tsx";
import { IncompleteResponseNoticeBlock } from "./behavior/IncompleteResponseNoticeBlock.tsx";
import { PlanProposalBlock } from "./behavior/PlanProposalBlock.tsx";
import { RateLimitNoticeBlock } from "./behavior/RateLimitNoticeBlock.tsx";
import { ThinkingStatusLine } from "./ThinkingStatusLine.tsx";
import { TurnFooter } from "./TurnFooter.tsx";
import { UserImageAttachmentBlock } from "./UserImageAttachmentBlock.tsx";
import { UserPromptBlock } from "./UserPromptBlock.tsx";
import { AssistantCodeExecutionWalkthroughPartView } from "./messageParts/AssistantCodeExecutionWalkthroughPartView.tsx";
import { AssistantTextPartView } from "./messageParts/AssistantTextPartView.tsx";
import { ReasoningPartView } from "./messageParts/ReasoningPartView.tsx";
import { ToolCallPartView } from "./messageParts/ToolCallPartView.tsx";
import { WorkspacePatchPartView } from "./messageParts/WorkspacePatchPartView.tsx";
import { hasVisibleReasoningSummaryText } from "./messageParts/reasoningSummaryText.ts";

function ConversationMessagePartView(props: {
  conversationMessagePart: ConversationMessagePart;
  isReasoningSummaryVisible: boolean;
  horizontalRuleColor: string;
  userMessageBorderColor: string;
  workspacePatch?: WorkspacePatch;
  terminalColumnCount?: number | undefined;
}): ReactNode {
  const { conversationMessagePart } = props;
  if (conversationMessagePart.partKind === "user_text") {
    return (
      <UserPromptBlock
        promptText={conversationMessagePart.text}
        userPromptBorderColor={props.userMessageBorderColor}
      />
    );
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
    return (
      <ToolCallPartView
        assistantToolCallConversationMessagePart={conversationMessagePart}
        {...(props.workspacePatch !== undefined ? { workspacePatch: props.workspacePatch } : {})}
      />
    );
  }
  if (conversationMessagePart.partKind === "assistant_workspace_patch") {
    return <WorkspacePatchPartView assistantWorkspacePatchConversationMessagePart={conversationMessagePart} />;
  }
  if (conversationMessagePart.partKind === "assistant_plan_proposal") {
    return <PlanProposalBlock planTitle={conversationMessagePart.planTitle} planSteps={conversationMessagePart.planSteps} />;
  }
  if (conversationMessagePart.partKind === "assistant_code_execution_walkthrough") {
    return <AssistantCodeExecutionWalkthroughPartView assistantCodeExecutionWalkthroughConversationMessagePart={conversationMessagePart} />;
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
  userMessageBorderColor: string;
  terminalColumnCount?: number | undefined;
};

function shouldUseCompactSpacingBetweenParts(input: {
  currentConversationMessagePart: ConversationMessagePart;
  previousConversationMessagePart: ConversationMessagePart | undefined;
}): boolean {
  return input.currentConversationMessagePart.partKind === "assistant_tool_call" &&
    input.previousConversationMessagePart?.partKind === "assistant_tool_call";
}

function shouldRenderConversationMessagePart(input: {
  conversationMessagePart: ConversationMessagePart;
  isReasoningSummaryVisible: boolean;
}): boolean {
  if (input.conversationMessagePart.partKind === "assistant_text") {
    return input.conversationMessagePart.rawMarkdownText.trim().length > 0;
  }

  if (input.conversationMessagePart.partKind === "assistant_reasoning") {
    return input.isReasoningSummaryVisible && hasVisibleReasoningSummaryText(input.conversationMessagePart.reasoningSummaryText);
  }

  return true;
}

type WorkspacePatchMergeResult = {
  renderableConversationMessageParts: ConversationMessagePart[];
  workspacePatchByToolCallPartId: Map<string, WorkspacePatch>;
};

function mergeMatchingWorkspacePatchesIntoToolCallParts(
  conversationMessageParts: readonly ConversationMessagePart[],
): WorkspacePatchMergeResult {
  const workspacePatchPartsByToolCallId = collectWorkspacePatchPartsByToolCallId(conversationMessageParts);
  const consumedWorkspacePatchPartIds = new Set<string>();
  const workspacePatchByToolCallPartId = new Map<string, WorkspacePatch>();

  for (const conversationMessagePart of conversationMessageParts) {
    if (conversationMessagePart.partKind !== "assistant_tool_call" ||
      !canToolCallRenderMergedWorkspacePatch(conversationMessagePart)) {
      continue;
    }

    const matchingWorkspacePatchPart = workspacePatchPartsByToolCallId
      .get(conversationMessagePart.toolCallId)
      ?.find((workspacePatchPart) => !consumedWorkspacePatchPartIds.has(workspacePatchPart.id));
    if (!matchingWorkspacePatchPart) {
      continue;
    }

    consumedWorkspacePatchPartIds.add(matchingWorkspacePatchPart.id);
    workspacePatchByToolCallPartId.set(conversationMessagePart.id, matchingWorkspacePatchPart.workspacePatch);
  }

  return {
    renderableConversationMessageParts: conversationMessageParts.filter((conversationMessagePart) => {
      return conversationMessagePart.partKind !== "assistant_workspace_patch" ||
        !consumedWorkspacePatchPartIds.has(conversationMessagePart.id);
    }),
    workspacePatchByToolCallPartId,
  };
}

function collectWorkspacePatchPartsByToolCallId(
  conversationMessageParts: readonly ConversationMessagePart[],
): Map<string, AssistantWorkspacePatchConversationMessagePart[]> {
  const workspacePatchPartsByToolCallId = new Map<string, AssistantWorkspacePatchConversationMessagePart[]>();

  for (const conversationMessagePart of conversationMessageParts) {
    if (conversationMessagePart.partKind !== "assistant_workspace_patch") {
      continue;
    }

    const toolCallWorkspacePatchParts = workspacePatchPartsByToolCallId.get(
      conversationMessagePart.workspacePatch.toolCallId,
    ) ?? [];
    toolCallWorkspacePatchParts.push(conversationMessagePart);
    workspacePatchPartsByToolCallId.set(conversationMessagePart.workspacePatch.toolCallId, toolCallWorkspacePatchParts);
  }

  return workspacePatchPartsByToolCallId;
}

function canToolCallRenderMergedWorkspacePatch(
  conversationMessagePart: AssistantToolCallConversationMessagePart,
): boolean {
  return conversationMessagePart.toolCallDetail.toolName === "edit" ||
    conversationMessagePart.toolCallDetail.toolName === "write" ||
    conversationMessagePart.toolCallDetail.toolName === "bash";
}

export function listRenderableConversationMessageParts(input: {
  conversationMessageParts: readonly ConversationMessagePart[];
  isReasoningSummaryVisible: boolean;
}): ConversationMessagePart[] {
  return input.conversationMessageParts.filter((conversationMessagePart) =>
    shouldRenderConversationMessagePart({
      conversationMessagePart,
      isReasoningSummaryVisible: input.isReasoningSummaryVisible,
    })
  );
}

export function ConversationMessageRow(props: ConversationMessageRowProps): ReactNode {
  const visibleConversationMessageParts = listRenderableConversationMessageParts({
    conversationMessageParts: props.conversationMessageParts,
    isReasoningSummaryVisible: props.isReasoningSummaryVisible,
  });
  const {
    renderableConversationMessageParts,
    workspacePatchByToolCallPartId,
  } = mergeMatchingWorkspacePatchesIntoToolCallParts(visibleConversationMessageParts);
  const shouldRenderEmptyAssistantThinkingLine = props.conversationMessage.role === "assistant" &&
    props.conversationMessage.messageStatus === "streaming" &&
    renderableConversationMessageParts.length === 0;

  return (
    <box flexDirection="column" width="100%">
      {shouldRenderEmptyAssistantThinkingLine ? (
        <ThinkingStatusLine thinkingStartedAtMs={props.conversationMessage.createdAtMs} />
      ) : null}
      {renderableConversationMessageParts.map((conversationMessagePart, index) => {
        const workspacePatch = conversationMessagePart.partKind === "assistant_tool_call"
          ? workspacePatchByToolCallPartId.get(conversationMessagePart.id)
          : undefined;
        return (
          <box
            flexDirection="column"
            flexShrink={0}
            key={conversationMessagePart.id}
            marginTop={index === 0 || shouldUseCompactSpacingBetweenParts({
                currentConversationMessagePart: conversationMessagePart,
                previousConversationMessagePart: renderableConversationMessageParts[index - 1],
              })
              ? 0
              : 1}
            width="100%"
          >
            <ConversationMessagePartView
              conversationMessagePart={conversationMessagePart}
              isReasoningSummaryVisible={props.isReasoningSummaryVisible}
              horizontalRuleColor={props.horizontalRuleColor}
              userMessageBorderColor={props.userMessageBorderColor}
              {...(workspacePatch !== undefined ? { workspacePatch } : {})}
              terminalColumnCount={props.terminalColumnCount}
            />
          </box>
        );
      })}
    </box>
  );
}
