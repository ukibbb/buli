import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React from "react";
import type { BuliDiagnosticLogger } from "@buli/contracts";
import type { AssistantConversationRunner } from "@buli/engine";
import { ChatScreen, type ChatScreenProps } from "./ChatScreen.tsx";
import { restoreConsoleTimeStampAfterOpentuiActivation } from "./restoreConsoleTimeStampAfterOpentuiActivation.ts";
import { ActiveConversationTurnShutdownCoordinator } from "./activeConversationTurnShutdown.ts";
export { ChatScreen } from "./ChatScreen.tsx";
export type { ChatScreenProps, ConversationSessionExportResult, ConversationSessionSwitchResult } from "./ChatScreen.tsx";
export { ActiveConversationTurnShutdownCoordinator } from "./activeConversationTurnShutdown.ts";

export type TuiChatScreenInstance = {
  destroy(): void;
  waitUntilExit(): Promise<void>;
};

export async function renderChatScreenInTerminal(input: {
  selectedModelId: string;
  selectedModelDefaultReasoningEffort?: ChatScreenProps["selectedModelDefaultReasoningEffort"];
  selectedReasoningEffort?: ChatScreenProps["selectedReasoningEffort"];
  initialConversationSessionId?: ChatScreenProps["initialConversationSessionId"];
  initialConversationSessionEntries?: ChatScreenProps["initialConversationSessionEntries"];
  loadAvailableAssistantModels: ChatScreenProps["loadAvailableAssistantModels"];
  loadPromptContextCandidates: ChatScreenProps["loadPromptContextCandidates"];
  loadConversationSessions?: ChatScreenProps["loadConversationSessions"];
  switchConversationSession?: ChatScreenProps["switchConversationSession"];
  exportCurrentConversationSession?: ChatScreenProps["exportCurrentConversationSession"];
  assistantConversationRunner: AssistantConversationRunner;
  onConversationCleared?: ChatScreenProps["onConversationCleared"];
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): Promise<TuiChatScreenInstance> {
  const originalConsole = globalThis.console;
  const consoleMode = process.env.BULI_CONSOLE_LOG_FILE?.trim() ? "disabled" : "console-overlay";
  input.diagnosticLogger?.({
    subsystem: "tui",
    eventName: "terminal_renderer_create_requested",
    fields: {
      screenMode: "alternate-screen",
      consoleMode,
      useMouse: true,
      enableMouseMovement: true,
    },
  });
  const cliRenderer = await createCliRenderer({
    screenMode: "alternate-screen",
    useMouse: true,
    enableMouseMovement: true,
    consoleMode,
  });
  const rendererDestroyedPromise = new Promise<void>((resolve) => {
    cliRenderer.once("destroy", () => resolve());
  });
  restoreConsoleTimeStampAfterOpentuiActivation({ originalConsole });
  const root = createRoot(cliRenderer);
  const activeConversationTurnShutdownCoordinator = new ActiveConversationTurnShutdownCoordinator();
  input.diagnosticLogger?.({
    subsystem: "tui",
    eventName: "terminal_renderer_created",
    fields: {
      consoleMode,
    },
  });
  root.render(
    React.createElement(ChatScreen, {
      assistantConversationRunner: input.assistantConversationRunner,
      activeConversationTurnShutdownCoordinator,
      loadAvailableAssistantModels: input.loadAvailableAssistantModels,
      loadPromptContextCandidates: input.loadPromptContextCandidates,
      ...(input.loadConversationSessions ? { loadConversationSessions: input.loadConversationSessions } : {}),
      ...(input.switchConversationSession ? { switchConversationSession: input.switchConversationSession } : {}),
      ...(input.exportCurrentConversationSession
        ? { exportCurrentConversationSession: input.exportCurrentConversationSession }
        : {}),
      ...(input.onConversationCleared ? { onConversationCleared: input.onConversationCleared } : {}),
      selectedModelId: input.selectedModelId,
      ...(input.initialConversationSessionId !== undefined
        ? { initialConversationSessionId: input.initialConversationSessionId }
        : {}),
      ...(input.initialConversationSessionEntries !== undefined
        ? { initialConversationSessionEntries: input.initialConversationSessionEntries }
        : {}),
      ...(input.selectedModelDefaultReasoningEffort !== undefined
        ? { selectedModelDefaultReasoningEffort: input.selectedModelDefaultReasoningEffort }
        : {}),
      ...(input.selectedReasoningEffort !== undefined
        ? { selectedReasoningEffort: input.selectedReasoningEffort }
        : {}),
      ...(input.diagnosticLogger ? { diagnosticLogger: input.diagnosticLogger } : {}),
    }),
  );
  input.diagnosticLogger?.({
    subsystem: "tui",
    eventName: "chat_screen_root_rendered",
    fields: {
      selectedModelId: input.selectedModelId,
      selectedModelDefaultReasoningEffort: input.selectedModelDefaultReasoningEffort ?? null,
      selectedReasoningEffort: input.selectedReasoningEffort ?? null,
    },
  });

  return {
    destroy(): void {
      cliRenderer.destroy();
    },
    async waitUntilExit(): Promise<void> {
      await rendererDestroyedPromise;
      await activeConversationTurnShutdownCoordinator.interruptActiveConversationTurnAndWaitForSettlement();
    },
  };
}

export { relayAssistantResponseRunnerEvents } from "./relayAssistantResponseRunnerEvents.ts";
export { RenderAssistantResponseTree } from "./richText/renderAssistantResponseTree.tsx";
export type { RenderAssistantResponseTreeProps } from "./richText/renderAssistantResponseTree.tsx";
export { ConversationMessageList } from "./components/ConversationMessageList.tsx";
export { CommandHelpModal } from "./components/CommandHelpModal.tsx";
export { ConversationSessionSelectionPane } from "./components/ConversationSessionSelectionPane.tsx";
export { InputPanel } from "./components/InputPanel.tsx";
export { ModelAndReasoningSelectionPane } from "./components/ModelAndReasoningSelectionPane.tsx";
export { PromptContextSelectionPane } from "./components/PromptContextSelectionPane.tsx";
export { PromptDraftText } from "./components/PromptDraftText.tsx";
export { ReasoningCollapsedChip } from "./components/ReasoningCollapsedChip.tsx";
export { SlashCommandSelectionPane } from "./components/SlashCommandSelectionPane.tsx";
export { ThinkingStatusLine } from "./components/ThinkingStatusLine.tsx";
export { TopBar } from "./components/TopBar.tsx";
export { UserPromptBlock } from "./components/UserPromptBlock.tsx";
export { buildChatSlashCommands } from "@buli/chat-session-state";
