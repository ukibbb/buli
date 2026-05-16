import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  createStartedToolCallDetailFromRequest,
  isWorkspaceInspectionToolCallRequest,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type ToolCallRequest,
  type ToolCallRequestByName,
  type WorkspaceInspectionToolCallRequest,
  type WorkspaceInspectionToolRequestName,
} from "@buli/contracts";
import type { ProviderConversationTurn } from "./provider.ts";
import type { ProjectInstructionTracker } from "./projectInstructions.ts";
import { logEngineDiagnosticEvent, summarizeAssistantResponseEventForDiagnostics } from "./runtimeDiagnostics.ts";
import type { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import { runGlobToolCall } from "./tools/globTool.ts";
import { runGrepToolCall } from "./tools/grepTool.ts";
import { runReadToolCall } from "./tools/readTool.ts";
import type { ToolCallOutcome } from "./tools/toolCallOutcome.ts";

export type AutoApprovedReadOnlyToolCallRequest = WorkspaceInspectionToolCallRequest;

type AutoApprovedReadOnlyToolName = WorkspaceInspectionToolRequestName;
type AutoApprovedReadOnlyToolCallRequestByName<ToolName extends AutoApprovedReadOnlyToolName> = ToolCallRequestByName<ToolName>;

type AutoApprovedReadOnlyToolCallExecutorRunInput<ToolName extends AutoApprovedReadOnlyToolName> = {
  toolCallRequest: AutoApprovedReadOnlyToolCallRequestByName<ToolName>;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  abortSignal: AbortSignal;
};

type AutoApprovedReadOnlyToolCallExecutor<ToolName extends AutoApprovedReadOnlyToolName> = {
  runToolCall(input: AutoApprovedReadOnlyToolCallExecutorRunInput<ToolName>): Promise<ToolCallOutcome>;
};

const autoApprovedReadOnlyToolCallExecutorByName: {
  readonly [ToolName in AutoApprovedReadOnlyToolName]: AutoApprovedReadOnlyToolCallExecutor<ToolName>;
} = {
  read: {
    runToolCall: (input) =>
      runReadToolCall({
        readToolCallRequest: input.toolCallRequest,
        workspaceRootPath: input.workspaceRootPath,
        ...(input.projectInstructionTracker ? { projectInstructionTracker: input.projectInstructionTracker } : {}),
        abortSignal: input.abortSignal,
      }),
  },
  glob: {
    runToolCall: (input) =>
      runGlobToolCall({
        globToolCallRequest: input.toolCallRequest,
        workspaceRootPath: input.workspaceRootPath,
        abortSignal: input.abortSignal,
      }),
  },
  grep: {
    runToolCall: (input) =>
      runGrepToolCall({
        grepToolCallRequest: input.toolCallRequest,
        workspaceRootPath: input.workspaceRootPath,
        abortSignal: input.abortSignal,
      }),
  },
};

export type StreamAssistantResponseEventsForAutoApprovedReadOnlyToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  toolCallId: string;
  toolCallRequest: AutoApprovedReadOnlyToolCallRequest;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export async function* streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall(
  input: StreamAssistantResponseEventsForAutoApprovedReadOnlyToolCallInput,
): AsyncGenerator<AssistantResponseEvent> {
  const startedToolCallDetail = createStartedToolCallDetailFromRequest(input.toolCallRequest);
  const toolCallPartId = randomUUID();
  const toolCallStartedAtMs = Date.now();

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

  input.throwIfConversationTurnInterrupted();
  const toolCallOutcome = await runAutoApprovedReadOnlyToolCall({
    toolCallRequest: input.toolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    ...(input.projectInstructionTracker ? { projectInstructionTracker: input.projectInstructionTracker } : {}),
    abortSignal: input.abortSignal,
  });
  input.throwIfConversationTurnInterrupted();

  if (toolCallOutcome.outcomeKind === "completed") {
    input.toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: toolCallOutcome.toolCallDetail,
      toolResultText: toolCallOutcome.toolResultText,
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
        toolCallDetail: toolCallOutcome.toolCallDetail,
        durationMs: toolCallOutcome.durationMilliseconds,
      }),
    }));
    logEngineDiagnosticEvent(input.diagnosticLogger, "provider_turn.tool_result_submitted", {
      toolCallId: input.toolCallId,
      toolResultKind: "completed",
      toolResultTextLength: toolCallOutcome.toolResultText.length,
    });
    await input.providerConversationTurn.submitToolResult({
      toolCallId: input.toolCallId,
      toolResultText: toolCallOutcome.toolResultText,
    });
    return;
  }

  input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
    toolCallId: input.toolCallId,
    toolCallDetail: toolCallOutcome.toolCallDetail,
    toolResultText: toolCallOutcome.toolResultText,
    failureExplanation: toolCallOutcome.failureExplanation,
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
      toolCallDetail: toolCallOutcome.toolCallDetail,
      errorText: toolCallOutcome.failureExplanation,
      durationMs: toolCallOutcome.durationMilliseconds,
    }),
  }));
  logEngineDiagnosticEvent(input.diagnosticLogger, "provider_turn.tool_result_submitted", {
    toolCallId: input.toolCallId,
    toolResultKind: "failed",
    toolResultTextLength: toolCallOutcome.toolResultText.length,
  });
  await input.providerConversationTurn.submitToolResult({
    toolCallId: input.toolCallId,
    toolResultText: toolCallOutcome.toolResultText,
  });
}

export function isAutoApprovedReadOnlyToolCallRequest(
  toolCallRequest: ToolCallRequest,
): toolCallRequest is AutoApprovedReadOnlyToolCallRequest {
  return isWorkspaceInspectionToolCallRequest(toolCallRequest);
}

function runAutoApprovedReadOnlyToolCall(input: {
  toolCallRequest: AutoApprovedReadOnlyToolCallRequest;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  abortSignal: AbortSignal;
}): Promise<ToolCallOutcome> {
  if (input.toolCallRequest.toolName === "read") {
    return autoApprovedReadOnlyToolCallExecutorByName.read.runToolCall({
      ...input,
      toolCallRequest: input.toolCallRequest,
    });
  }
  if (input.toolCallRequest.toolName === "glob") {
    return autoApprovedReadOnlyToolCallExecutorByName.glob.runToolCall({
      ...input,
      toolCallRequest: input.toolCallRequest,
    });
  }
  if (input.toolCallRequest.toolName === "grep") {
    return autoApprovedReadOnlyToolCallExecutorByName.grep.runToolCall({
      ...input,
      toolCallRequest: input.toolCallRequest,
    });
  }

  return assertUnhandledReadOnlyToolCallRequest(input.toolCallRequest);
}

function assertUnhandledReadOnlyToolCallRequest(toolCallRequest: never): never {
  throw new Error(`Unhandled read-only tool call request: ${JSON.stringify(toolCallRequest)}`);
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
