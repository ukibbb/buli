import { useMemo, type ReactNode } from "react";
import type {
  AssistantToolCallConversationMessagePart,
  AssistantWorkspacePatchConversationMessagePart,
  ConversationMessage,
  ConversationMessagePart,
  PendingToolApprovalRequest,
  WorkspacePatch,
} from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
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

type ConversationMessagePartViewProps = {
  conversationMessagePart: ConversationMessagePart;
  isReasoningSummaryVisible: boolean;
  horizontalRuleColor: string;
  pendingToolApprovalDecision?: PendingToolApprovalDecision;
  userMessageBorderColor: string;
  workspacePatch?: WorkspacePatch;
  terminalColumnCount?: number | undefined;
};

type ConversationMessagePartKind = ConversationMessagePart["partKind"];
type ConversationMessagePartByKind<PartKind extends ConversationMessagePartKind> = Extract<
  ConversationMessagePart,
  { partKind: PartKind }
>;
type ConversationMessagePartRendererProps<PartKind extends ConversationMessagePartKind> = Omit<
  ConversationMessagePartViewProps,
  "conversationMessagePart"
> & {
  conversationMessagePart: ConversationMessagePartByKind<PartKind>;
};
type ConversationMessagePartRenderer<PartKind extends ConversationMessagePartKind> = (
  props: ConversationMessagePartRendererProps<PartKind>,
) => ReactNode;

const conversationMessagePartRendererByKind: {
  readonly [PartKind in ConversationMessagePartKind]: ConversationMessagePartRenderer<PartKind>;
} = {
  user_text: renderUserTextConversationMessagePart,
  user_image_attachment: renderUserImageAttachmentConversationMessagePart,
  assistant_text: renderAssistantTextConversationMessagePart,
  assistant_reasoning: renderAssistantReasoningConversationMessagePart,
  assistant_tool_call: renderAssistantToolCallConversationMessagePart,
  assistant_workspace_patch: renderAssistantWorkspacePatchConversationMessagePart,
  assistant_plan_proposal: renderAssistantPlanProposalConversationMessagePart,
  assistant_rate_limit_notice: renderAssistantRateLimitNoticeConversationMessagePart,
  assistant_incomplete_notice: renderAssistantIncompleteNoticeConversationMessagePart,
  assistant_error_notice: renderAssistantErrorNoticeConversationMessagePart,
  assistant_interrupted_notice: renderAssistantInterruptedNoticeConversationMessagePart,
  assistant_turn_summary: renderHiddenConversationMessagePart,
  assistant_compaction_separator: renderAssistantCompactionSeparatorConversationMessagePart,
};

function ConversationMessagePartView(props: ConversationMessagePartViewProps): ReactNode {
  const renderConversationMessagePart = resolveConversationMessagePartRenderer(props.conversationMessagePart);
  return renderConversationMessagePart(props);
}

function resolveConversationMessagePartRenderer<PartKind extends ConversationMessagePartKind>(
  conversationMessagePart: ConversationMessagePartByKind<PartKind>,
): ConversationMessagePartRenderer<PartKind> {
  return conversationMessagePartRendererByKind[conversationMessagePart.partKind] as ConversationMessagePartRenderer<PartKind>;
}

function renderUserTextConversationMessagePart(props: ConversationMessagePartRendererProps<"user_text">): ReactNode {
  return (
    <UserPromptBlock
      promptText={props.conversationMessagePart.text}
      userPromptBorderColor={props.userMessageBorderColor}
    />
  );
}

function renderUserImageAttachmentConversationMessagePart(
  props: ConversationMessagePartRendererProps<"user_image_attachment">,
): ReactNode {
  return <UserImageAttachmentBlock attachment={props.conversationMessagePart.attachment} />;
}

function renderAssistantTextConversationMessagePart(
  props: ConversationMessagePartRendererProps<"assistant_text">,
): ReactNode {
  return (
    <AssistantTextPartView
      assistantTextConversationMessagePart={props.conversationMessagePart}
      horizontalRuleColor={props.horizontalRuleColor}
      terminalColumnCount={props.terminalColumnCount}
    />
  );
}

function renderAssistantCompactionSeparatorConversationMessagePart(
  props: ConversationMessagePartRendererProps<"assistant_compaction_separator">,
): ReactNode {
  return (
    <CompactionSeparatorPartView
      assistantCompactionSeparatorConversationMessagePart={props.conversationMessagePart}
      accentColor={props.horizontalRuleColor}
    />
  );
}

function renderAssistantReasoningConversationMessagePart(
  props: ConversationMessagePartRendererProps<"assistant_reasoning">,
): ReactNode {
  return (
    <ReasoningPartView
      assistantReasoningConversationMessagePart={props.conversationMessagePart}
      isReasoningSummaryVisible={props.isReasoningSummaryVisible}
    />
  );
}

function renderAssistantToolCallConversationMessagePart(
  props: ConversationMessagePartRendererProps<"assistant_tool_call">,
): ReactNode {
  const pendingToolCallApprovalDecisionActions = resolvePendingToolCallApprovalDecisionActions({
    conversationMessagePart: props.conversationMessagePart,
    pendingToolApprovalDecision: props.pendingToolApprovalDecision,
  });
  return (
    <ToolCallPartView
      assistantToolCallConversationMessagePart={props.conversationMessagePart}
      {...(pendingToolCallApprovalDecisionActions !== undefined
        ? { pendingToolCallApprovalDecisionActions }
        : {})}
      {...(props.workspacePatch !== undefined ? { workspacePatch: props.workspacePatch } : {})}
    />
  );
}

function renderAssistantWorkspacePatchConversationMessagePart(
  props: ConversationMessagePartRendererProps<"assistant_workspace_patch">,
): ReactNode {
  return <WorkspacePatchPartView assistantWorkspacePatchConversationMessagePart={props.conversationMessagePart} />;
}

function renderAssistantPlanProposalConversationMessagePart(
  props: ConversationMessagePartRendererProps<"assistant_plan_proposal">,
): ReactNode {
  return (
    <PlanProposalBlock
      planTitle={props.conversationMessagePart.planTitle}
      planSteps={props.conversationMessagePart.planSteps}
    />
  );
}

function renderAssistantRateLimitNoticeConversationMessagePart(
  props: ConversationMessagePartRendererProps<"assistant_rate_limit_notice">,
): ReactNode {
  return (
    <RateLimitNoticeBlock
      retryAfterSeconds={props.conversationMessagePart.retryAfterSeconds}
      limitExplanation={props.conversationMessagePart.limitExplanation}
      noticeStartedAtMs={props.conversationMessagePart.noticeStartedAtMs}
    />
  );
}

function renderAssistantIncompleteNoticeConversationMessagePart(
  props: ConversationMessagePartRendererProps<"assistant_incomplete_notice">,
): ReactNode {
  return <IncompleteResponseNoticeBlock incompleteReason={props.conversationMessagePart.incompleteReason} />;
}

function renderAssistantErrorNoticeConversationMessagePart(
  props: ConversationMessagePartRendererProps<"assistant_error_notice">,
): ReactNode {
  return <ErrorBannerBlock errorText={props.conversationMessagePart.errorText} />;
}

function renderAssistantInterruptedNoticeConversationMessagePart(
  props: ConversationMessagePartRendererProps<"assistant_interrupted_notice">,
): ReactNode {
  return <ErrorBannerBlock titleText="Interrupted" errorText={props.conversationMessagePart.interruptionReason} />;
}

function renderHiddenConversationMessagePart(
  _props: ConversationMessagePartRendererProps<"assistant_turn_summary">,
): ReactNode {
  return null;
}

function CompactedOutOfModelContextNotice(): ReactNode {
  return <text fg={chatScreenTheme.textDim}>Compacted out of model context</text>;
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

const mergedWorkspacePatchToolNames = new Set<AssistantToolCallConversationMessagePart["toolCallDetail"]["toolName"]>([
  "edit",
  "edit_many",
  "patch",
  "patch_many",
  "write",
  "bash",
]);

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
  return mergedWorkspacePatchToolNames.has(conversationMessagePart.toolCallDetail.toolName);
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
  const shouldRenderCompactedOutNotice = props.conversationMessage.modelContextVisibility ===
    "compacted_out_of_model_context";

  return (
    <box flexDirection="column" width="100%">
      {shouldRenderCompactedOutNotice ? <CompactedOutOfModelContextNotice /> : null}
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
