import { memo, useCallback, useSyncExternalStore, type ReactNode } from "react";
import type { ConversationTurnStatus } from "@buli/contracts";
import type { ChatAppRenderStore, ConversationSessionCompactionStatus } from "@buli/chat-app-controller";
import { LiveInteractionStatusStack, type LiveInteractionStatusStackProps } from "./LiveInteractionStatusStack.tsx";
import { PromptComposerChrome, type PromptComposerChromeProps } from "./PromptComposerChrome.tsx";
import { ChatScreenSlot } from "../slots/chatScreenSlots.tsx";

export type LiveInteractionChromeProps = {
  statusStackProps: LiveInteractionStatusStackProps;
  liveStatusExtraProps: LiveInteractionChromeStatusExtraProps;
  promptComposerProps: PromptComposerChromeProps;
};

export type LiveInteractionChromeStatusExtraProps =
  | StoreBackedLiveInteractionChromeStatusExtraProps
  | DirectLiveInteractionChromeStatusExtraProps;

type StoreBackedLiveInteractionChromeStatusExtraProps = {
  chatAppRenderStore: ChatAppRenderStore;
};

type DirectLiveInteractionChromeStatusExtraProps = {
  chatAppRenderStore?: undefined;
  conversationTurnStatus: ConversationTurnStatus;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  queuedPromptCount: number;
};

function LiveInteractionChromeComponent(props: LiveInteractionChromeProps): ReactNode {
  return (
    <box flexDirection="column" flexShrink={0}>
      <LiveInteractionStatusStack {...props.statusStackProps} />
      <LiveInteractionStatusExtra {...props.liveStatusExtraProps} />
      <PromptComposerChrome {...props.promptComposerProps} />
    </box>
  );
}

function LiveInteractionStatusExtra(props: LiveInteractionChromeStatusExtraProps): ReactNode {
  if (props.chatAppRenderStore) {
    return <StoreBackedLiveInteractionStatusExtra chatAppRenderStore={props.chatAppRenderStore} />;
  }

  return <LiveInteractionStatusExtraSlot {...props} />;
}

function StoreBackedLiveInteractionStatusExtra(props: StoreBackedLiveInteractionChromeStatusExtraProps): ReactNode {
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

  return (
    <LiveInteractionStatusExtraSlot
      conversationTurnStatus={interactionStatusSnapshot.conversationTurnStatus}
      conversationSessionCompactionStatus={interactionStatusSnapshot.conversationSessionCompactionStatus}
      queuedPromptCount={interactionStatusSnapshot.queuedPromptCount}
    />
  );
}

function LiveInteractionStatusExtraSlot(props: DirectLiveInteractionChromeStatusExtraProps): ReactNode {
  return (
    <ChatScreenSlot
      name="live_status_extra"
      conversationTurnStatus={props.conversationTurnStatus}
      conversationSessionCompactionStatus={props.conversationSessionCompactionStatus}
      queuedPromptCount={props.queuedPromptCount}
    />
  );
}

export const LiveInteractionChrome = memo(LiveInteractionChromeComponent);
