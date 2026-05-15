import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type ExploreToolCallRequest,
  type ProviderAvailableToolName,
  type ProviderStreamEvent,
  type ReasoningEffort,
  type ToolCallDetail,
  type ToolCallExploreDetail,
  type ToolCallRequest,
} from "@buli/contracts";
import { InMemoryConversationHistory } from "./conversationHistory.ts";
import type { ConversationTurnProvider, ProviderConversationTurn } from "./provider.ts";
import { logEngineDiagnosticEvent, summarizeAssistantResponseEventForDiagnostics } from "./runtimeDiagnostics.ts";
import { toProjectInstructionSnapshots, type ProjectInstructionTracker } from "./projectInstructions.ts";
import {
  isAutoApprovedReadOnlyToolCallRequest,
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall,
} from "./runtimeReadOnlyToolCallExecution.ts";
import { RuntimeConversationTurnSessionRecorder } from "./runtimeConversationTurnSessionRecorder.ts";
import { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import { buildBuliExplorerSystemPrompt } from "./systemPrompt.ts";

const EXPLORER_AVAILABLE_TOOL_NAMES = ["read", "glob", "grep"] as const satisfies readonly ProviderAvailableToolName[];
const NESTED_EXPLORER_DENIAL_TEXT = "Explorer cannot spawn another Explorer. Continue with read, glob, and grep instead.";

type ExplorerConversationOutcome = {
  outcomeKind: "completed" | "failed";
  explorationResultSummary: string;
  toolResultText: string;
  durationMilliseconds: number;
  failureExplanation?: string;
};

export type StreamAssistantResponseEventsForExploreToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  conversationTurnProvider: ConversationTurnProvider;
  toolCallId: string;
  exploreToolCallRequest: ExploreToolCallRequest;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  workspaceRootPath: string;
  projectInstructionTracker: ProjectInstructionTracker;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  abortSignal: AbortSignal;
  canSpawnExplorer: boolean;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export function isExploreToolCallRequest(toolCallRequest: ToolCallRequest): toolCallRequest is ExploreToolCallRequest {
  return toolCallRequest.toolName === "explore";
}

export async function* streamAssistantResponseEventsForExploreToolCall(
  input: StreamAssistantResponseEventsForExploreToolCallInput,
): AsyncGenerator<AssistantResponseEvent> {
  const toolCallPartId = randomUUID();
  const toolCallStartedAtMs = Date.now();
  const startedToolCallDetail = createStartedExploreToolCallDetail(input.exploreToolCallRequest);

  yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartAddedEventSchema.parse({
    type: "assistant_message_part_added",
    messageId: input.assistantResponseMessageId,
    part: AssistantToolCallConversationMessagePartSchema.parse({
      id: toolCallPartId,
      partKind: "assistant_tool_call",
      toolCallId: input.toolCallId,
      toolCallStatus: "running",
      toolCallStartedAtMs,
      toolCallDetail: startedToolCallDetail,
    }),
  }));

  if (!input.canSpawnExplorer) {
    const deniedToolCallDetail = startedToolCallDetail;
    input.toolResultSessionRecorder.appendDeniedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: deniedToolCallDetail,
      toolResultText: NESTED_EXPLORER_DENIAL_TEXT,
      denialExplanation: NESTED_EXPLORER_DENIAL_TEXT,
    });
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
      type: "assistant_message_part_updated",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: input.toolCallId,
        toolCallStatus: "denied",
        toolCallStartedAtMs,
        toolCallDetail: deniedToolCallDetail,
        denialText: NESTED_EXPLORER_DENIAL_TEXT,
        durationMs: Date.now() - toolCallStartedAtMs,
      }),
    }));
    await submitExplorerToolResult({
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: input.toolCallId,
      toolResultText: NESTED_EXPLORER_DENIAL_TEXT,
      diagnosticLogger: input.diagnosticLogger,
      toolResultKind: "denied",
    });
    return;
  }

  input.throwIfConversationTurnInterrupted();
  const explorerConversationOutcome = await runExplorerConversation({
    conversationTurnProvider: input.conversationTurnProvider,
    exploreToolCallRequest: input.exploreToolCallRequest,
    selectedModelId: input.selectedModelId,
    ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
    workspaceRootPath: input.workspaceRootPath,
    projectInstructionTracker: input.projectInstructionTracker,
    abortSignal: input.abortSignal,
    throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
    diagnosticLogger: input.diagnosticLogger,
  });
  input.throwIfConversationTurnInterrupted();

  const completedToolCallDetail: ToolCallExploreDetail = {
    ...startedToolCallDetail,
    explorationResultSummary: explorerConversationOutcome.explorationResultSummary,
  };

  if (explorerConversationOutcome.outcomeKind === "completed") {
    input.toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: completedToolCallDetail,
      toolResultText: explorerConversationOutcome.toolResultText,
    });
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
      type: "assistant_message_part_updated",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: input.toolCallId,
        toolCallStatus: "completed",
        toolCallStartedAtMs,
        toolCallDetail: completedToolCallDetail,
        durationMs: explorerConversationOutcome.durationMilliseconds,
      }),
    }));
    await submitExplorerToolResult({
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: input.toolCallId,
      toolResultText: explorerConversationOutcome.toolResultText,
      diagnosticLogger: input.diagnosticLogger,
      toolResultKind: "completed",
    });
    return;
  }

  const failureExplanation = explorerConversationOutcome.failureExplanation ?? "Explorer failed before returning a result.";
  input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
    toolCallId: input.toolCallId,
    toolCallDetail: completedToolCallDetail,
    toolResultText: explorerConversationOutcome.toolResultText,
    failureExplanation,
  });
  yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
    type: "assistant_message_part_updated",
    messageId: input.assistantResponseMessageId,
    part: AssistantToolCallConversationMessagePartSchema.parse({
      id: toolCallPartId,
      partKind: "assistant_tool_call",
      toolCallId: input.toolCallId,
      toolCallStatus: "failed",
      toolCallStartedAtMs,
      toolCallDetail: completedToolCallDetail,
      errorText: failureExplanation,
      durationMs: explorerConversationOutcome.durationMilliseconds,
    }),
  }));
  await submitExplorerToolResult({
    providerConversationTurn: input.providerConversationTurn,
    toolCallId: input.toolCallId,
    toolResultText: explorerConversationOutcome.toolResultText,
    diagnosticLogger: input.diagnosticLogger,
    toolResultKind: "failed",
  });
}

function createStartedExploreToolCallDetail(exploreToolCallRequest: ExploreToolCallRequest): ToolCallExploreDetail {
  return {
    toolName: "explore",
    explorationDescription: exploreToolCallRequest.explorationDescription,
    explorationPrompt: exploreToolCallRequest.explorationPrompt,
  };
}

async function runExplorerConversation(input: {
  conversationTurnProvider: ConversationTurnProvider;
  exploreToolCallRequest: ExploreToolCallRequest;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  workspaceRootPath: string;
  projectInstructionTracker: ProjectInstructionTracker;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): Promise<ExplorerConversationOutcome> {
  const explorerConversationStartedAtMs = Date.now();
  const explorerPromptText = buildExplorerPromptText(input.exploreToolCallRequest);
  const explorerConversationHistory = new InMemoryConversationHistory();
  const explorerConversationSessionRecorder = new RuntimeConversationTurnSessionRecorder({
    conversationHistory: explorerConversationHistory,
    userPromptText: explorerPromptText,
    assistantOperatingMode: "understand",
    diagnosticLogger: input.diagnosticLogger,
  });
  const explorerToolResultSessionRecorder = new RuntimeToolResultSessionRecorder({
    conversationHistory: explorerConversationHistory,
    diagnosticLogger: input.diagnosticLogger,
  });
  let explorerAssistantMessageText = "";

  try {
    explorerConversationSessionRecorder.appendAcceptedUserPromptSessionEntry(explorerPromptText);
    const explorerProviderConversationTurn = input.conversationTurnProvider.startConversationTurn({
      systemPromptText: buildBuliExplorerSystemPrompt({
        workspaceRootPath: input.workspaceRootPath,
        projectInstructionSnapshots: toProjectInstructionSnapshots(input.projectInstructionTracker.listProjectInstructionFiles()),
      }),
      conversationSessionEntries: explorerConversationHistory.listConversationSessionEntries(),
      selectedModelId: input.selectedModelId,
      ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
      availableToolNames: EXPLORER_AVAILABLE_TOOL_NAMES,
      abortSignal: input.abortSignal,
    });

    for await (const providerStreamEvent of explorerProviderConversationTurn.streamProviderEvents()) {
      input.throwIfConversationTurnInterrupted();

      if (providerStreamEvent.type === "text_chunk") {
        explorerAssistantMessageText += providerStreamEvent.text;
        continue;
      }

      if (providerStreamEvent.type === "tool_call_requested") {
        await executeExplorerChildToolCall({
          providerStreamEvent,
          explorerProviderConversationTurn,
          explorerConversationHistory,
          explorerToolResultSessionRecorder,
          workspaceRootPath: input.workspaceRootPath,
          projectInstructionTracker: input.projectInstructionTracker,
          abortSignal: input.abortSignal,
          throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
          diagnosticLogger: input.diagnosticLogger,
        });
        continue;
      }

      if (providerStreamEvent.type === "completed") {
        const explorationResultSummary = explorerAssistantMessageText.trim();
        if (explorationResultSummary.length === 0) {
          const failureExplanation = "Explorer completed without returning a summary.";
          explorerConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
            entryKind: "assistant_message",
            assistantMessageStatus: "failed",
            assistantMessageText: explorerAssistantMessageText,
            failureExplanation,
          });
          return createFailedExplorerConversationOutcome({
            exploreToolCallRequest: input.exploreToolCallRequest,
            failureExplanation,
            durationMilliseconds: Date.now() - explorerConversationStartedAtMs,
          });
        }

        explorerConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
          entryKind: "assistant_message",
          assistantMessageStatus: "completed",
          assistantMessageText: explorationResultSummary,
        });
        return {
          outcomeKind: "completed",
          explorationResultSummary,
          toolResultText: buildExplorerCompletedToolResultText({
            exploreToolCallRequest: input.exploreToolCallRequest,
            explorationResultSummary,
          }),
          durationMilliseconds: Date.now() - explorerConversationStartedAtMs,
        };
      }

      if (providerStreamEvent.type === "incomplete") {
        const failureExplanation = `Explorer stopped before completion: ${providerStreamEvent.incompleteReason}`;
        explorerConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
          entryKind: "assistant_message",
          assistantMessageStatus: "incomplete",
          assistantMessageText: explorerAssistantMessageText,
          incompleteReason: providerStreamEvent.incompleteReason,
        });
        return createFailedExplorerConversationOutcome({
          exploreToolCallRequest: input.exploreToolCallRequest,
          failureExplanation,
          explorationResultSummary: explorerAssistantMessageText.trim(),
          durationMilliseconds: Date.now() - explorerConversationStartedAtMs,
        });
      }
    }

    const failureExplanation = "Explorer provider stream ended before completion.";
    explorerConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: explorerAssistantMessageText,
      failureExplanation,
    });
    return createFailedExplorerConversationOutcome({
      exploreToolCallRequest: input.exploreToolCallRequest,
      failureExplanation,
      explorationResultSummary: explorerAssistantMessageText.trim(),
      durationMilliseconds: Date.now() - explorerConversationStartedAtMs,
    });
  } catch (error) {
    if (input.abortSignal.aborted) {
      throw error;
    }

    const failureExplanation = error instanceof Error ? error.message : String(error);
    if (!explorerConversationSessionRecorder.hasAppendedTerminalAssistantMessageSessionEntry()) {
      explorerConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
        entryKind: "assistant_message",
        assistantMessageStatus: "failed",
        assistantMessageText: explorerAssistantMessageText,
        failureExplanation,
      });
    }
    return createFailedExplorerConversationOutcome({
      exploreToolCallRequest: input.exploreToolCallRequest,
      failureExplanation,
      explorationResultSummary: explorerAssistantMessageText.trim(),
      durationMilliseconds: Date.now() - explorerConversationStartedAtMs,
    });
  }
}

async function executeExplorerChildToolCall(input: {
  providerStreamEvent: Extract<ProviderStreamEvent, { type: "tool_call_requested" }>;
  explorerProviderConversationTurn: ProviderConversationTurn;
  explorerConversationHistory: InMemoryConversationHistory;
  explorerToolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  workspaceRootPath: string;
  projectInstructionTracker: ProjectInstructionTracker;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): Promise<void> {
  input.explorerConversationHistory.appendConversationSessionEntry({
    entryKind: "tool_call",
    toolCallId: input.providerStreamEvent.toolCallId,
    toolCallRequest: input.providerStreamEvent.toolCallRequest,
  });

  if (isAutoApprovedReadOnlyToolCallRequest(input.providerStreamEvent.toolCallRequest)) {
    for await (const _assistantResponseEvent of streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall({
      assistantResponseMessageId: randomUUID(),
      providerConversationTurn: input.explorerProviderConversationTurn,
      toolCallId: input.providerStreamEvent.toolCallId,
      toolCallRequest: input.providerStreamEvent.toolCallRequest,
      workspaceRootPath: input.workspaceRootPath,
      projectInstructionTracker: input.projectInstructionTracker,
      toolResultSessionRecorder: input.explorerToolResultSessionRecorder,
      abortSignal: input.abortSignal,
      throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
      diagnosticLogger: input.diagnosticLogger,
    })) {
      input.throwIfConversationTurnInterrupted();
    }
    return;
  }

  const denialExplanation = buildExplorerDisallowedToolDenialText(input.providerStreamEvent.toolCallRequest);
  input.explorerToolResultSessionRecorder.appendDeniedToolResultSessionEntry({
    toolCallId: input.providerStreamEvent.toolCallId,
    toolCallDetail: createToolCallDetailFromRequest(input.providerStreamEvent.toolCallRequest),
    toolResultText: denialExplanation,
    denialExplanation,
  });
  await input.explorerProviderConversationTurn.submitToolResult({
    toolCallId: input.providerStreamEvent.toolCallId,
    toolResultText: denialExplanation,
  });
}

function buildExplorerPromptText(exploreToolCallRequest: ExploreToolCallRequest): string {
  return [
    `Exploration description: ${exploreToolCallRequest.explorationDescription}`,
    "",
    "Detailed exploration instructions:",
    exploreToolCallRequest.explorationPrompt,
    "",
    "Return a concise report for the parent assistant. Include important file paths, function names, and line references when they matter.",
  ].join("\n");
}

function buildExplorerCompletedToolResultText(input: {
  exploreToolCallRequest: ExploreToolCallRequest;
  explorationResultSummary: string;
}): string {
  return [
    "<explorer_result>",
    `<description>${input.exploreToolCallRequest.explorationDescription}</description>`,
    "<summary>",
    input.explorationResultSummary,
    "</summary>",
    "</explorer_result>",
  ].join("\n");
}

function createFailedExplorerConversationOutcome(input: {
  exploreToolCallRequest: ExploreToolCallRequest;
  failureExplanation: string;
  explorationResultSummary?: string;
  durationMilliseconds: number;
}): ExplorerConversationOutcome {
  const explorationResultSummary = input.explorationResultSummary && input.explorationResultSummary.length > 0
    ? input.explorationResultSummary
    : input.failureExplanation;
  return {
    outcomeKind: "failed",
    explorationResultSummary,
    toolResultText: [
      "<explorer_result>",
      `<description>${input.exploreToolCallRequest.explorationDescription}</description>`,
      "<failure>",
      input.failureExplanation,
      "</failure>",
      ...(input.explorationResultSummary && input.explorationResultSummary.length > 0
        ? ["<partial_summary>", input.explorationResultSummary, "</partial_summary>"]
        : []),
      "</explorer_result>",
    ].join("\n"),
    durationMilliseconds: input.durationMilliseconds,
    failureExplanation: input.failureExplanation,
  };
}

function buildExplorerDisallowedToolDenialText(toolCallRequest: ToolCallRequest): string {
  if (toolCallRequest.toolName === "explore") {
    return NESTED_EXPLORER_DENIAL_TEXT;
  }

  return `Explorer is read-only and cannot use ${toolCallRequest.toolName}. Use read, glob, or grep instead.`;
}

function createToolCallDetailFromRequest(toolCallRequest: ToolCallRequest): ToolCallDetail {
  if (toolCallRequest.toolName === "bash") {
    return {
      toolName: "bash",
      commandLine: toolCallRequest.shellCommand,
      commandDescription: toolCallRequest.commandDescription,
      ...(toolCallRequest.workingDirectoryPath ? { workingDirectoryPath: toolCallRequest.workingDirectoryPath } : {}),
      ...(toolCallRequest.timeoutMilliseconds ? { timeoutMilliseconds: toolCallRequest.timeoutMilliseconds } : {}),
    };
  }
  if (toolCallRequest.toolName === "read") {
    return { toolName: "read", readFilePath: toolCallRequest.readTargetPath };
  }
  if (toolCallRequest.toolName === "glob") {
    return {
      toolName: "glob",
      globPattern: toolCallRequest.globPattern,
      ...(toolCallRequest.searchDirectoryPath ? { searchDirectoryPath: toolCallRequest.searchDirectoryPath } : {}),
    };
  }
  if (toolCallRequest.toolName === "grep") {
    return { toolName: "grep", searchPattern: toolCallRequest.regexPattern };
  }
  if (toolCallRequest.toolName === "edit") {
    return { toolName: "edit", editedFilePath: toolCallRequest.editTargetPath };
  }
  if (toolCallRequest.toolName === "write") {
    return { toolName: "write", writtenFilePath: toolCallRequest.writeTargetPath };
  }
  if (toolCallRequest.toolName === "explore") {
    return createStartedExploreToolCallDetail(toolCallRequest);
  }

  return assertUnhandledToolCallRequest(toolCallRequest);
}

function assertUnhandledToolCallRequest(toolCallRequest: never): never {
  throw new Error(`Unhandled tool call request: ${JSON.stringify(toolCallRequest)}`);
}

async function submitExplorerToolResult(input: {
  providerConversationTurn: ProviderConversationTurn;
  toolCallId: string;
  toolResultText: string;
  toolResultKind: "completed" | "failed" | "denied";
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): Promise<void> {
  logEngineDiagnosticEvent(input.diagnosticLogger, "provider_turn.tool_result_submitted", {
    toolCallId: input.toolCallId,
    toolResultKind: input.toolResultKind,
    toolResultTextLength: input.toolResultText.length,
  });
  await input.providerConversationTurn.submitToolResult({
    toolCallId: input.toolCallId,
    toolResultText: input.toolResultText,
  });
}

function logAssistantResponseEventEmitted(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  assistantResponseEvent: AssistantResponseEvent,
): AssistantResponseEvent {
  logEngineDiagnosticEvent(diagnosticLogger, "assistant_response_event.emitted", {
    eventType: assistantResponseEvent.type,
    ...summarizeAssistantResponseEventForDiagnostics(assistantResponseEvent),
  });
  return assistantResponseEvent;
}
