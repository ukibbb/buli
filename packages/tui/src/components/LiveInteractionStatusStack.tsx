import type {
  ConversationSessionSelectionState,
  ModelAndReasoningSelectionState,
  PromptContextSelectionState,
  SlashCommandSelectionState,
} from "@buli/chat-session-state";
import type {
  ChatAppInteractionStatusRenderSnapshot,
  ChatAppRenderStore,
  ConversationSessionCompactionStatus,
  ConversationSessionExportStatus,
  QueuedChatAppPromptPreview,
} from "@buli/chat-app-controller";
import { chatScreenTheme, type ChatScreenTheme } from "@buli/assistant-design-tokens";
import { memo, useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { ConversationSessionSelectionPane } from "./ConversationSessionSelectionPane.tsx";
import { ModelAndReasoningSelectionPane } from "./ModelAndReasoningSelectionPane.tsx";
import { PromptContextSelectionPane } from "./PromptContextSelectionPane.tsx";
import { SelectionPaneFrame } from "./SelectionPaneFrame.tsx";
import { SlashCommandSelectionPane } from "./SlashCommandSelectionPane.tsx";
import { ErrorBannerBlock } from "./behavior/ErrorBannerBlock.tsx";
import { QueuedPromptStack } from "./QueuedPromptStack.tsx";

export type LiveInteractionStatusStackProps = LiveInteractionStatusStackCommonProps & (
  | StoreBackedLiveInteractionStatusStackProps
  | DirectLiveInteractionStatusStackProps
);

type LiveInteractionStatusStackCommonProps = {
  inputPanelAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  shouldHideQueuedPromptPreviews?: boolean | undefined;
  onConversationSessionDeletionRequested: (conversationSessionId: string) => void | Promise<void>;
};

type StoreBackedLiveInteractionStatusStackProps = {
  chatAppRenderStore: ChatAppRenderStore;
};

type DirectLiveInteractionStatusStackProps = LiveInteractionStatusStackRenderState & {
  chatAppRenderStore?: undefined;
};

type LiveInteractionStatusStackRenderState = {
  conversationSessionSelectionState: ConversationSessionSelectionState;
  modelAndReasoningSelectionState: ModelAndReasoningSelectionState;
  slashCommandSelectionState: SlashCommandSelectionState;
  promptContextSelectionState: PromptContextSelectionState;
  conversationSessionExportStatus: ConversationSessionExportStatus;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  queuedPromptPreviews: readonly QueuedChatAppPromptPreview[];
};

const emptyQueuedPromptPreviews: readonly QueuedChatAppPromptPreview[] = [];
const emptyModelAndReasoningVisibleChoices: string[] = [];

function LiveInteractionStatusStackComponent(props: LiveInteractionStatusStackProps): ReactNode {
  if (props.chatAppRenderStore) {
    return <StoreBackedLiveInteractionStatusStack {...props} chatAppRenderStore={props.chatAppRenderStore} />;
  }

  return <LiveInteractionStatusStackLayout {...props} statusStackRenderState={props} />;
}

function StoreBackedLiveInteractionStatusStack(
  props: LiveInteractionStatusStackCommonProps & StoreBackedLiveInteractionStatusStackProps,
): ReactNode {
  const subscribeToInteractionStatus = useCallback(
    (listener: () => void) => props.chatAppRenderStore.subscribeInteractionStatus(listener),
    [props.chatAppRenderStore],
  );
  const readInteractionStatusSnapshot = useCallback(
    () => props.chatAppRenderStore.readInteractionStatusSnapshot(),
    [props.chatAppRenderStore],
  );
  const interactionStatusSnapshot = useSyncExternalStore(
    subscribeToInteractionStatus,
    readInteractionStatusSnapshot,
    readInteractionStatusSnapshot,
  );

  return <LiveInteractionStatusStackLayout {...props} statusStackRenderState={toStatusStackRenderState(interactionStatusSnapshot)} />;
}

function LiveInteractionStatusStackLayout(
  props: LiveInteractionStatusStackCommonProps & { statusStackRenderState: LiveInteractionStatusStackRenderState },
): ReactNode {
  const statusStackRenderState = props.statusStackRenderState;
  const modelAndReasoningSelectionState = statusStackRenderState.modelAndReasoningSelectionState;
  const queuedPromptPreviews = props.shouldHideQueuedPromptPreviews
    ? emptyQueuedPromptPreviews
    : statusStackRenderState.queuedPromptPreviews;
  const availableModelDisplayNames = useMemo(
    () =>
      modelAndReasoningSelectionState.step === "showing_available_models"
        ? modelAndReasoningSelectionState.availableModels.map((availableAssistantModel) => availableAssistantModel.displayName)
        : emptyModelAndReasoningVisibleChoices,
    [modelAndReasoningSelectionState.step === "showing_available_models" ? modelAndReasoningSelectionState.availableModels : undefined],
  );
  const availableReasoningEffortChoiceLabels = useMemo(
    () =>
      modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices"
        ? modelAndReasoningSelectionState.availableReasoningEffortChoices.map(
          (availableReasoningEffortChoice) => availableReasoningEffortChoice.displayLabel,
        )
        : emptyModelAndReasoningVisibleChoices,
    [
      modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices"
        ? modelAndReasoningSelectionState.availableReasoningEffortChoices
        : undefined,
    ],
  );

  return (
    <>
      {renderConversationSessionExportStatusPane(statusStackRenderState.conversationSessionExportStatus)}
      {renderConversationSessionCompactionStatusPane(statusStackRenderState.conversationSessionCompactionStatus)}
      <QueuedPromptStack queuedPromptPreviews={queuedPromptPreviews} accentColor={props.inputPanelAccentColor} />
      {renderConversationSessionSelectionPane(props)}
      {renderModelAndReasoningSelectionPane({
        ...props,
        availableModelDisplayNames,
        availableReasoningEffortChoiceLabels,
      })}
      {renderSlashCommandSelectionPane(props)}
      {renderPromptContextSelectionPane(props)}
    </>
  );
}

export const LiveInteractionStatusStack = memo(LiveInteractionStatusStackComponent);

function toStatusStackRenderState(
  interactionStatusSnapshot: ChatAppInteractionStatusRenderSnapshot,
): LiveInteractionStatusStackRenderState {
  return {
    conversationSessionSelectionState: interactionStatusSnapshot.conversationSessionSelectionState,
    modelAndReasoningSelectionState: interactionStatusSnapshot.modelAndReasoningSelectionState,
    slashCommandSelectionState: interactionStatusSnapshot.slashCommandSelectionState,
    promptContextSelectionState: interactionStatusSnapshot.promptContextSelectionState,
    conversationSessionExportStatus: interactionStatusSnapshot.conversationSessionExportStatus,
    conversationSessionCompactionStatus: interactionStatusSnapshot.conversationSessionCompactionStatus,
    queuedPromptPreviews: interactionStatusSnapshot.queuedPromptPreviews,
  };
}

function renderConversationSessionExportStatusPane(conversationSessionExportStatus: ConversationSessionExportStatus): ReactNode {
  return conversationSessionExportStatus.step === "failed" ? (
    <box paddingX={2} marginBottom={1}>
      <ErrorBannerBlock titleText="Could not export session" errorText={conversationSessionExportStatus.errorMessage} />
    </box>
  ) : null;
}

function renderConversationSessionCompactionStatusPane(
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus,
): ReactNode {
  return conversationSessionCompactionStatus.step === "failed" ? (
    <box paddingX={2} marginBottom={1}>
      <ErrorBannerBlock titleText="Could not compact session" errorText={conversationSessionCompactionStatus.errorMessage} />
    </box>
  ) : null;
}

function renderConversationSessionSelectionPane(
  props: LiveInteractionStatusStackCommonProps & { statusStackRenderState: LiveInteractionStatusStackRenderState },
): ReactNode {
  return props.statusStackRenderState.conversationSessionSelectionState.step === "loading_conversation_sessions" ? (
    <SelectionPaneFrame accentColor={props.inputPanelAccentColor}>
      <text fg={chatScreenTheme.textSecondary}>Loading sessions...</text>
    </SelectionPaneFrame>
  ) : props.statusStackRenderState.conversationSessionSelectionState.step === "showing_session_loading_error" ? (
    <box paddingX={2}>
      <ErrorBannerBlock
        titleText="Could not load sessions"
        errorText={props.statusStackRenderState.conversationSessionSelectionState.errorMessage}
      />
    </box>
  ) : props.statusStackRenderState.conversationSessionSelectionState.step === "showing_conversation_sessions" ? (
    <ConversationSessionSelectionPane
      conversationSessions={props.statusStackRenderState.conversationSessionSelectionState.conversationSessions}
      highlightedConversationSessionIndex={
        props.statusStackRenderState.conversationSessionSelectionState.highlightedConversationSessionIndex
      }
      activeConversationSessionId={props.statusStackRenderState.conversationSessionSelectionState.activeConversationSessionId}
      pendingDeletionConversationSessionId={
        props.statusStackRenderState.conversationSessionSelectionState.pendingDeletionConversationSessionId
      }
      accentColor={props.inputPanelAccentColor}
      onConversationSessionDeletionRequested={props.onConversationSessionDeletionRequested}
    />
  ) : null;
}

function renderPromptContextSelectionPane(
  props: LiveInteractionStatusStackCommonProps & { statusStackRenderState: LiveInteractionStatusStackRenderState },
): ReactNode {
  return props.statusStackRenderState.promptContextSelectionState.step === "showing_prompt_context_candidates" ? (
    <PromptContextSelectionPane
      promptContextCandidates={props.statusStackRenderState.promptContextSelectionState.promptContextCandidates}
      highlightedPromptContextCandidateIndex={
        props.statusStackRenderState.promptContextSelectionState.highlightedPromptContextCandidateIndex
      }
      accentColor={props.inputPanelAccentColor}
    />
  ) : null;
}

function renderModelAndReasoningSelectionPane(
  props: LiveInteractionStatusStackCommonProps & {
    statusStackRenderState: LiveInteractionStatusStackRenderState;
    availableModelDisplayNames: string[];
    availableReasoningEffortChoiceLabels: string[];
  },
): ReactNode {
  const modelAndReasoningSelectionState = props.statusStackRenderState.modelAndReasoningSelectionState;
  return modelAndReasoningSelectionState.step === "loading_available_models" ? (
    <SelectionPaneFrame accentColor={props.inputPanelAccentColor}>
      <text fg={chatScreenTheme.textSecondary}>Loading models...</text>
    </SelectionPaneFrame>
  ) : modelAndReasoningSelectionState.step === "showing_model_loading_error" ? (
    <box paddingX={2}>
      <ErrorBannerBlock titleText="Could not load models" errorText={modelAndReasoningSelectionState.errorMessage} />
    </box>
  ) : modelAndReasoningSelectionState.step === "showing_available_models" ? (
    <ModelAndReasoningSelectionPane
      visibleChoices={props.availableModelDisplayNames}
      highlightedChoiceIndex={modelAndReasoningSelectionState.highlightedModelIndex}
      accentColor={props.inputPanelAccentColor}
    />
  ) : modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices" ? (
    <ModelAndReasoningSelectionPane
      visibleChoices={props.availableReasoningEffortChoiceLabels}
      highlightedChoiceIndex={modelAndReasoningSelectionState.highlightedReasoningEffortChoiceIndex}
      accentColor={props.inputPanelAccentColor}
    />
  ) : null;
}

function renderSlashCommandSelectionPane(
  props: LiveInteractionStatusStackCommonProps & { statusStackRenderState: LiveInteractionStatusStackRenderState },
): ReactNode {
  return props.statusStackRenderState.slashCommandSelectionState.step === "showing_slash_commands" ? (
    <SlashCommandSelectionPane
      availableSlashCommands={props.statusStackRenderState.slashCommandSelectionState.availableSlashCommands}
      highlightedSlashCommandIndex={props.statusStackRenderState.slashCommandSelectionState.highlightedSlashCommandIndex}
      accentColor={props.inputPanelAccentColor}
    />
  ) : null;
}
