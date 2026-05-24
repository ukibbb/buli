import type { AvailableAssistantModel } from "@buli/contracts";
import {
  showAvailableAssistantModelsForSelection,
  showModelSelectionLoadingError,
  showModelSelectionLoadingState,
  type ChatSessionState,
} from "@buli/chat-session-state";
import { startTransition, useEffectEvent, useRef, type Dispatch, type SetStateAction } from "react";

export type UseChatAppModelSelectionActionsInput = {
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  setChatSessionState: Dispatch<SetStateAction<ChatSessionState>>;
};

export type UseChatAppModelSelectionActionsResult = {
  loadAvailableModelsForSelection: () => Promise<void>;
};

export function useChatAppModelSelectionActions(
  input: UseChatAppModelSelectionActionsInput,
): UseChatAppModelSelectionActionsResult {
  const latestModelSelectionLoadRequestSequenceRef = useRef(0);

  const loadAvailableModelsForSelection = useEffectEvent(async () => {
    const requestSequence = latestModelSelectionLoadRequestSequenceRef.current + 1;
    latestModelSelectionLoadRequestSequenceRef.current = requestSequence;
    input.setChatSessionState((currentChatSessionState) => showModelSelectionLoadingState(currentChatSessionState));

    try {
      const availableAssistantModels = await input.loadAvailableAssistantModels();
      if (requestSequence !== latestModelSelectionLoadRequestSequenceRef.current) {
        return;
      }
      startTransition(() => {
        input.setChatSessionState((currentChatSessionState) =>
          showAvailableAssistantModelsForSelection(currentChatSessionState, availableAssistantModels),
        );
      });
    } catch (error) {
      if (requestSequence !== latestModelSelectionLoadRequestSequenceRef.current) {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      startTransition(() => {
        input.setChatSessionState((currentChatSessionState) =>
          showModelSelectionLoadingError(currentChatSessionState, errorMessage),
        );
      });
    }
  });

  return { loadAvailableModelsForSelection };
}
