import { useMemo, type ReactNode } from "react";
import type {
  AssistantToolCallConversationMessagePart,
  AssistantWorkspacePatchConversationMessagePart,
  ConversationMessage,
  ConversationMessagePart,
  PendingToolApprovalRequest,
  WorkspacePatch,
} from "@buli/contracts";
import { ErrorBannerBlock } from "./behavior/ErrorBannerBlock.tsx";
import { IncompleteResponseNoticeBlock } from "./behavior/IncompleteResponseNoticeBlock.tsx";
import { PlanProposalBlock } from "./behavior/PlanProposalBlock.tsx";
import { RateLimitNoticeBlock } from "./behavior/RateLimitNoticeBlock.tsx";
import { ThinkingStatusLine } from "./ThinkingStatusLine.tsx";
import { UserImageAttachmentBlock } from "./UserImageAttachmentBlock.tsx";
import { UserPromptBlock } from "./UserPromptBlock.tsx";
import { AssistantTextPartView } from "./messageParts/AssistantTextPartView.tsx";
import { CompactionSeparatorPartView } from "./messageParts/CompactionSeparatorPartView.tsx";
import { ReasoningPartView } from "./messageParts/ReasoningPartView.tsx";
import { ToolCallPartView } from "./messageParts/ToolCallPartView.tsx";
import { WorkspacePatchPartView } from "./messageParts/WorkspacePatchPartView.tsx";
import { hasVisibleReasoningSummaryText } from "./messageParts/reasoningSummaryText.ts";

function ConversationMessagePartView(props: {
  conversationMessagePart: ConversationMessagePart;
  isReasoningSummaryVisible: boolean;
  horizontalRuleColor: string;
  pendingToolApprovalDecision?: PendingToolApprovalDecision;
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
  if (conversationMessagePart.partKind === "assistant_compaction_separator") {
    return (
      <CompactionSeparatorPartView
        assistantCompactionSeparatorConversationMessagePart={conversationMessagePart}
        accentColor={props.horizontalRuleColor}
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
    const pendingToolCallApprovalDecisionActions = resolvePendingToolCallApprovalDecisionActions({
      conversationMessagePart,
      pendingToolApprovalDecision: props.pendingToolApprovalDecision,
    });
    return (
      <ToolCallPartView
        assistantToolCallConversationMessagePart={conversationMessagePart}
        {...(pendingToolCallApprovalDecisionActions !== undefined
          ? { pendingToolCallApprovalDecisionActions }
          : {})}
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
  return null;
}

export type ConversationMessageRowProps = {
  conversationMessage: ConversationMessage;
  conversationMessageParts: readonly ConversationMessagePart[];
  isReasoningSummaryVisible: boolean;
  horizontalRuleColor: string;
  pendingToolApprovalDecision?: PendingToolApprovalDecision;
  userMessageBorderColor: string;
  terminalColumnCount?: number | undefined;
};

export type PendingToolApprovalDecision = {
  pendingToolApprovalRequest: PendingToolApprovalRequest;
  onPendingToolApprovalApproved: () => void;
  onPendingToolApprovalDenied: () => void;
};

function resolvePendingToolCallApprovalDecisionActions(input: {
  conversationMessagePart: AssistantToolCallConversationMessagePart;
  pendingToolApprovalDecision: PendingToolApprovalDecision | undefined;
}): { onApprove: () => void; onDeny: () => void } | undefined {
  if (
    input.pendingToolApprovalDecision?.pendingToolApprovalRequest.pendingToolCallId !==
      input.conversationMessagePart.toolCallId
  ) {
    return undefined;
  }

  return {
    onApprove: input.pendingToolApprovalDecision.onPendingToolApprovalApproved,
    onDeny: input.pendingToolApprovalDecision.onPendingToolApprovalDenied,
  };
}

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

  if (input.conversationMessagePart.partKind === "assistant_turn_summary") {
    return false;
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
    conversationMessagePart.toolCallDetail.toolName === "edit_many" ||
    conversationMessagePart.toolCallDetail.toolName === "patch" ||
    conversationMessagePart.toolCallDetail.toolName === "patch_many" ||
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
  const {
    renderableConversationMessageParts,
    workspacePatchByToolCallPartId,
  } = useMemo(
    () => mergeMatchingWorkspacePatchesIntoToolCallParts(props.conversationMessageParts),
    [props.conversationMessageParts],
  );
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
              {...(props.pendingToolApprovalDecision !== undefined
                ? { pendingToolApprovalDecision: props.pendingToolApprovalDecision }
                : {})}
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
