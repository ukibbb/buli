import type { AvailableAssistantModel, BuliDiagnosticLogger } from "@buli/contracts";
import {
  showAvailableAssistantModelsForSelection,
  showModelSelectionLoadingError,
  showModelSelectionLoadingState,
  type ChatSessionState,
} from "@buli/chat-session-state";
import { startTransition, useEffectEvent, useRef, type Dispatch, type SetStateAction } from "react";
import { logChatAppControllerDiagnosticEvent } from "./diagnostics.ts";

type MutableValueRef<T> = { current: T };

export type UseChatAppModelSelectionActionsInput = {
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  latestChatSessionStateRef: MutableValueRef<ChatSessionState>;
  setChatSessionState: Dispatch<SetStateAction<ChatSessionState>>;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
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
    logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.model_selection_load_started", {
      currentSelectedModelId: input.latestChatSessionStateRef.current.selectedModelId,
      requestSequence,
    });
    input.setChatSessionState((currentChatSessionState) => showModelSelectionLoadingState(currentChatSessionState));

    try {
      const availableAssistantModels = await input.loadAvailableAssistantModels();
      if (requestSequence !== latestModelSelectionLoadRequestSequenceRef.current) {
        logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.model_selection_load_discarded", {
          requestSequence,
          activeRequestSequence: latestModelSelectionLoadRequestSequenceRef.current,
          availableModelCount: availableAssistantModels.length,
        });
        return;
      }
      logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.model_selection_load_completed", {
        availableModelCount: availableAssistantModels.length,
        requestSequence,
      });
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
      logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.model_selection_load_failed", {
        errorMessage,
        requestSequence,
      });
      startTransition(() => {
        input.setChatSessionState((currentChatSessionState) =>
          showModelSelectionLoadingError(currentChatSessionState, errorMessage),
        );
      });
    }
  });

  return { loadAvailableModelsForSelection };
}
