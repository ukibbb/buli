import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type GlobToolCallRequest,
  type GrepToolCallRequest,
  type ReadToolCallRequest,
  type ToolCallDetail,
  type ToolCallRequest,
} from "@buli/contracts";
import type { ProviderConversationTurn } from "./provider.ts";
import { logEngineDiagnosticEvent, summarizeAssistantResponseEventForDiagnostics } from "./runtimeDiagnostics.ts";
import type { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import { createStartedGlobToolCallDetail, runGlobToolCall } from "./tools/globTool.ts";
import { createStartedGrepToolCallDetail, runGrepToolCall } from "./tools/grepTool.ts";
import { createStartedReadToolCallDetail, runReadToolCall } from "./tools/readTool.ts";
import type { ToolCallOutcome } from "./tools/toolCallOutcome.ts";

export type AutoApprovedReadOnlyToolCallRequest = ReadToolCallRequest | GlobToolCallRequest | GrepToolCallRequest;

export type StreamAssistantResponseEventsForAutoApprovedReadOnlyToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  toolCallId: string;
  toolCallRequest: AutoApprovedReadOnlyToolCallRequest;
  workspaceRootPath: string;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export async function* streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall(
  input: StreamAssistantResponseEventsForAutoApprovedReadOnlyToolCallInput,
): AsyncGenerator<AssistantResponseEvent> {
  const startedToolCallDetail = createStartedAutoApprovedReadOnlyToolCallDetail(input.toolCallRequest);
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
  return toolCallRequest.toolName === "read" || toolCallRequest.toolName === "glob" || toolCallRequest.toolName === "grep";
}

function createStartedAutoApprovedReadOnlyToolCallDetail(
  toolCallRequest: AutoApprovedReadOnlyToolCallRequest,
): ToolCallDetail {
  if (toolCallRequest.toolName === "read") {
    return createStartedReadToolCallDetail(toolCallRequest);
  }
  if (toolCallRequest.toolName === "glob") {
    return createStartedGlobToolCallDetail(toolCallRequest);
  }

  return createStartedGrepToolCallDetail(toolCallRequest);
}

function runAutoApprovedReadOnlyToolCall(input: {
  toolCallRequest: AutoApprovedReadOnlyToolCallRequest;
  workspaceRootPath: string;
  abortSignal: AbortSignal;
}): Promise<ToolCallOutcome> {
  if (input.toolCallRequest.toolName === "read") {
    return runReadToolCall({
      readToolCallRequest: input.toolCallRequest,
      workspaceRootPath: input.workspaceRootPath,
      abortSignal: input.abortSignal,
    });
  }
  if (input.toolCallRequest.toolName === "glob") {
    return runGlobToolCall({
      globToolCallRequest: input.toolCallRequest,
      workspaceRootPath: input.workspaceRootPath,
      abortSignal: input.abortSignal,
    });
  }

  return runGrepToolCall({
    grepToolCallRequest: input.toolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    abortSignal: input.abortSignal,
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
