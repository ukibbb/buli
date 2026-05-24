import {
  ActiveConversationTurnShutdownCoordinator,
  type ActiveConversationTurnShutdownCoordinator as ActiveConversationTurnShutdownCoordinatorType,
} from "@buli/chat-app-controller";
import type {
  BuliDiagnosticLogger,
  UserPromptImageAttachment,
} from "@buli/contracts";
import type { AssistantConversationRunner } from "@buli/engine";
import type { ReactNode } from "react";
import type { ChatScreenProps } from "./ChatScreen.tsx";
import { logTuiDiagnosticEvent } from "./diagnostics/logTuiDiagnosticEvent.ts";
import { restoreConsoleTimeStampAfterOpentuiActivation } from "./restoreConsoleTimeStampAfterOpentuiActivation.ts";

type EnvironmentVariableSnapshot = {
  name: string;
  value: string | undefined;
};

function restoreEnvironmentVariable(environmentVariableSnapshot: EnvironmentVariableSnapshot): void {
  if (environmentVariableSnapshot.value === undefined) {
    delete process.env[environmentVariableSnapshot.name];
    return;
  }

  process.env[environmentVariableSnapshot.name] = environmentVariableSnapshot.value;
}

function disableOpenTuiConsoleCaptureWhileFileLoggingIsActive(isConsoleFileLoggerActive: boolean): () => void {
  if (!isConsoleFileLoggerActive) {
    return () => {};
  }

  const previousOpenTuiUseConsoleEnvironment = {
    name: "OTUI_USE_CONSOLE",
    value: process.env["OTUI_USE_CONSOLE"],
  } satisfies EnvironmentVariableSnapshot;
  process.env["OTUI_USE_CONSOLE"] = "false";

  return () => restoreEnvironmentVariable(previousOpenTuiUseConsoleEnvironment);
}

function formatUnknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type TuiChatScreenInstance = {
  destroy(): void;
  waitUntilExit(): Promise<void>;
};

export type RenderChatScreenInTerminalInput = {
  selectedModelId: string;
  selectedModelDefaultReasoningEffort?: ChatScreenProps["selectedModelDefaultReasoningEffort"];
  selectedReasoningEffort?: ChatScreenProps["selectedReasoningEffort"];
  initialConversationSessionId?: ChatScreenProps["initialConversationSessionId"];
  initialConversationSessionEntries?: ChatScreenProps["initialConversationSessionEntries"];
  loadInitialConversationSessionEntries?: ChatScreenProps["loadInitialConversationSessionEntries"];
  onInitialConversationSessionEntriesHydrated?: ChatScreenProps["onInitialConversationSessionEntriesHydrated"];
  loadAvailableAssistantModels: ChatScreenProps["loadAvailableAssistantModels"];
  loadPromptContextCandidates: ChatScreenProps["loadPromptContextCandidates"];
  loadConversationSessions?: ChatScreenProps["loadConversationSessions"];
  switchConversationSession?: ChatScreenProps["switchConversationSession"];
  deleteConversationSession?: ChatScreenProps["deleteConversationSession"];
  exportCurrentConversationSession?: ChatScreenProps["exportCurrentConversationSession"];
  compactCurrentConversationSession?: ChatScreenProps["compactCurrentConversationSession"];
  autoCompactCurrentConversationSession?: ChatScreenProps["autoCompactCurrentConversationSession"];
  readClipboardImageAttachment?: () => Promise<UserPromptImageAttachment | undefined>;
  assistantConversationRunner: AssistantConversationRunner;
  onConversationCleared?: ChatScreenProps["onConversationCleared"];
  onConversationSessionModelSelectionChanged?: ChatScreenProps["onConversationSessionModelSelectionChanged"];
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type TerminalRendererCreateOptionsForChatScreen = {
  screenMode: "alternate-screen";
  clearOnShutdown: boolean;
  autoFocus: boolean;
  useMouse: boolean;
  enableMouseMovement: boolean;
  consoleMode: "console-overlay" | "disabled";
};

export type TerminalRendererForChatScreenRuntime = {
  readonly isDestroyed: boolean;
  destroy(): void;
  once(eventName: "destroy", listener: () => void): void;
};

export type ReactRootForChatScreenRuntime = {
  render(node: ReactNode): void;
  unmount(): void;
};

export type RenderChatScreenInTerminalRuntime<
  TerminalRenderer extends TerminalRendererForChatScreenRuntime,
> = {
  createTerminalRenderer: (options: TerminalRendererCreateOptionsForChatScreen) => Promise<TerminalRenderer>;
  createChatScreenRoot: (terminalRenderer: TerminalRenderer) => ReactRootForChatScreenRuntime;
  createChatScreenElement: (chatScreenProps: ChatScreenProps) => ReactNode;
};

export async function renderChatScreenInTerminalWithRuntime<
  TerminalRenderer extends TerminalRendererForChatScreenRuntime,
>(
  input: RenderChatScreenInTerminalInput,
  runtime: RenderChatScreenInTerminalRuntime<TerminalRenderer>,
): Promise<TuiChatScreenInstance> {
  const terminalRenderStartedAtMs = Date.now();
  const originalConsole = globalThis.console;
  const isConsoleFileLoggerActive = Boolean(process.env["BULI_CONSOLE_LOG_FILE"]?.trim());
  const consoleMode = isConsoleFileLoggerActive ? "disabled" : "console-overlay";
  const restoreOpenTuiConsoleCaptureEnvironment = disableOpenTuiConsoleCaptureWhileFileLoggingIsActive(
    isConsoleFileLoggerActive,
  );
  logTuiDiagnosticEvent(input.diagnosticLogger, "terminal_renderer_create_requested", {
    screenMode: "alternate-screen",
    consoleMode,
    openTuiUseConsole: process.env["OTUI_USE_CONSOLE"] ?? null,
    clearOnShutdown: true,
    autoFocus: false,
    useMouse: true,
    enableMouseMovement: true,
  });
  let cliRenderer: TerminalRenderer;
  const terminalRendererCreateStartedAtMs = Date.now();
  try {
    cliRenderer = await runtime.createTerminalRenderer({
      screenMode: "alternate-screen",
      clearOnShutdown: true,
      autoFocus: false,
      useMouse: true,
      enableMouseMovement: true,
      consoleMode,
    });
  } catch (error) {
    restoreOpenTuiConsoleCaptureEnvironment();
    throw error;
  }
  restoreConsoleTimeStampAfterOpentuiActivation({ originalConsole });
  const root = runtime.createChatScreenRoot(cliRenderer);
  let hasReactRootBeenUnmounted = false;
  let hasRendererShutdownBeenRequested = false;
  let hasOpenTuiConsoleCaptureEnvironmentBeenRestored = false;
  const activeConversationTurnShutdownCoordinator: ActiveConversationTurnShutdownCoordinatorType =
    new ActiveConversationTurnShutdownCoordinator();
  const restoreOpenTuiConsoleCaptureEnvironmentOnce = (): void => {
    if (hasOpenTuiConsoleCaptureEnvironmentBeenRestored) {
      return;
    }

    hasOpenTuiConsoleCaptureEnvironmentBeenRestored = true;
    restoreOpenTuiConsoleCaptureEnvironment();
  };
  const unmountReactRootOnce = (): void => {
    if (hasReactRootBeenUnmounted) {
      return;
    }

    hasReactRootBeenUnmounted = true;
    root.unmount();
  };
  const interruptActiveConversationTurnForShutdown = (): void => {
    try {
      activeConversationTurnShutdownCoordinator.interruptActiveConversationTurn();
    } catch (error) {
      logTuiDiagnosticEvent(input.diagnosticLogger, "chat_screen_active_turn_shutdown_interrupt_failed", {
        errorMessage: formatUnknownErrorMessage(error),
      });
    }
  };
  const rendererDestroyedPromise = new Promise<void>((resolve) => {
    cliRenderer.once("destroy", () => {
      try {
        interruptActiveConversationTurnForShutdown();
        unmountReactRootOnce();
      } catch (error) {
        logTuiDiagnosticEvent(input.diagnosticLogger, "chat_screen_root_unmount_failed", {
          errorMessage: formatUnknownErrorMessage(error),
        });
      } finally {
        restoreOpenTuiConsoleCaptureEnvironmentOnce();
        resolve();
      }
    });
  });
  const destroyRendererOnce = (): void => {
    if (hasRendererShutdownBeenRequested) {
      return;
    }

    hasRendererShutdownBeenRequested = true;
    try {
      interruptActiveConversationTurnForShutdown();
      unmountReactRootOnce();
    } finally {
      if (!cliRenderer.isDestroyed) {
        cliRenderer.destroy();
      } else {
        restoreOpenTuiConsoleCaptureEnvironmentOnce();
      }
    }
  };
  logTuiDiagnosticEvent(input.diagnosticLogger, "terminal_renderer_created", {
    consoleMode,
    rendererCreateDurationMs: Math.max(0, Date.now() - terminalRendererCreateStartedAtMs),
    renderTerminalElapsedMs: Math.max(0, Date.now() - terminalRenderStartedAtMs),
  });
  try {
    const chatScreenRootRenderStartedAtMs = Date.now();
    root.render(
      runtime.createChatScreenElement({
        assistantConversationRunner: input.assistantConversationRunner,
        activeConversationTurnShutdownCoordinator,
        loadAvailableAssistantModels: input.loadAvailableAssistantModels,
        loadPromptContextCandidates: input.loadPromptContextCandidates,
        ...(input.loadConversationSessions ? { loadConversationSessions: input.loadConversationSessions } : {}),
        ...(input.switchConversationSession ? { switchConversationSession: input.switchConversationSession } : {}),
        ...(input.deleteConversationSession ? { deleteConversationSession: input.deleteConversationSession } : {}),
        ...(input.exportCurrentConversationSession
          ? { exportCurrentConversationSession: input.exportCurrentConversationSession }
          : {}),
        ...(input.compactCurrentConversationSession
          ? { compactCurrentConversationSession: input.compactCurrentConversationSession }
          : {}),
        ...(input.autoCompactCurrentConversationSession
          ? { autoCompactCurrentConversationSession: input.autoCompactCurrentConversationSession }
          : {}),
        ...(input.readClipboardImageAttachment
          ? { readClipboardImageAttachment: input.readClipboardImageAttachment }
          : {}),
        ...(input.onConversationCleared ? { onConversationCleared: input.onConversationCleared } : {}),
        ...(input.onConversationSessionModelSelectionChanged
          ? { onConversationSessionModelSelectionChanged: input.onConversationSessionModelSelectionChanged }
          : {}),
        selectedModelId: input.selectedModelId,
        ...(input.initialConversationSessionId !== undefined
          ? { initialConversationSessionId: input.initialConversationSessionId }
          : {}),
        ...(input.initialConversationSessionEntries !== undefined
          ? { initialConversationSessionEntries: input.initialConversationSessionEntries }
          : {}),
        ...(input.loadInitialConversationSessionEntries !== undefined
          ? { loadInitialConversationSessionEntries: input.loadInitialConversationSessionEntries }
          : {}),
        ...(input.onInitialConversationSessionEntriesHydrated !== undefined
          ? { onInitialConversationSessionEntriesHydrated: input.onInitialConversationSessionEntriesHydrated }
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
    logTuiDiagnosticEvent(input.diagnosticLogger, "chat_screen_root_rendered", {
      selectedModelId: input.selectedModelId,
      selectedModelDefaultReasoningEffort: input.selectedModelDefaultReasoningEffort ?? null,
      selectedReasoningEffort: input.selectedReasoningEffort ?? null,
      rootRenderDurationMs: Math.max(0, Date.now() - chatScreenRootRenderStartedAtMs),
      renderTerminalElapsedMs: Math.max(0, Date.now() - terminalRenderStartedAtMs),
    });
  } catch (error) {
    destroyRendererOnce();
    throw error;
  }

  return {
    destroy(): void {
      destroyRendererOnce();
    },
    async waitUntilExit(): Promise<void> {
      await rendererDestroyedPromise;
      await activeConversationTurnShutdownCoordinator.interruptActiveConversationTurnAndWaitForSettlement();
    },
  };
}
