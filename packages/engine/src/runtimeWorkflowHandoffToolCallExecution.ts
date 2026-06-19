import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  createStartedToolCallDetailFromRequest,
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type RecordWorkflowHandoffToolCallRequest,
  type WorkflowHandoff,
} from "@buli/contracts";
import type { PrimaryAssistantAgentDefinition } from "./assistantAgentRegistry.ts";
import type { ProviderConversationTurn } from "./provider.ts";
import { logAssistantResponseEventEmitted, submitProviderToolResultWithDiagnostics } from "./runtimeToolCallExecutionDiagnostics.ts";
import type { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";

export type StreamAssistantResponseEventsForWorkflowHandoffToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  conversationTurnId: string;
  toolCallId: string;
  recordWorkflowHandoffToolCallRequest: RecordWorkflowHandoffToolCallRequest;
  assistantOperatingMode: AssistantOperatingMode;
  primaryAssistantAgent: PrimaryAssistantAgentDefinition;
  recordWorkflowHandoff: (workflowHandoff: WorkflowHandoff) => void;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

type WorkflowHandoffToolCallOutcome =
  | {
    outcomeKind: "completed";
    toolResultText: string;
  }
  | {
    outcomeKind: "failed";
    toolResultText: string;
    failureExplanation: string;
  };

export async function* streamAssistantResponseEventsForWorkflowHandoffToolCall(
  input: StreamAssistantResponseEventsForWorkflowHandoffToolCallInput,
): AsyncGenerator<AssistantResponseEvent> {
  const toolCallPartId = randomUUID();
  const toolCallStartedAtMs = Date.now();
  const startedToolCallDetail = createStartedToolCallDetailFromRequest(input.recordWorkflowHandoffToolCallRequest);

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
  const toolCallOutcome = recordWorkflowHandoffForCurrentMode(input);
  const durationMs = Date.now() - toolCallStartedAtMs;

  if (toolCallOutcome.outcomeKind === "completed") {
    input.toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: startedToolCallDetail,
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
        toolCallDetail: startedToolCallDetail,
        durationMs,
      }),
    }));
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      conversationTurnId: input.conversationTurnId,
      toolCallId: input.toolCallId,
      toolResultText: toolCallOutcome.toolResultText,
      toolResultKind: "completed",
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
    toolCallId: input.toolCallId,
    toolCallDetail: startedToolCallDetail,
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
      toolCallDetail: startedToolCallDetail,
      errorText: toolCallOutcome.failureExplanation,
      durationMs,
    }),
  }));
  await submitProviderToolResultWithDiagnostics({
    providerConversationTurn: input.providerConversationTurn,
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    toolResultText: toolCallOutcome.toolResultText,
    toolResultKind: "failed",
    diagnosticLogger: input.diagnosticLogger,
  });
}

function recordWorkflowHandoffForCurrentMode(
  input: StreamAssistantResponseEventsForWorkflowHandoffToolCallInput,
): WorkflowHandoffToolCallOutcome {
  const expectedWorkflowHandoffKind = input.primaryAssistantAgent.workflowHandoffKind;
  if (expectedWorkflowHandoffKind === undefined) {
    const failureExplanation = `${input.primaryAssistantAgent.displayName} is not configured to record workflow handoffs.`;
    return {
      outcomeKind: "failed",
      failureExplanation,
      toolResultText: failureExplanation,
    };
  }

  if (input.recordWorkflowHandoffToolCallRequest.workflowHandoff.handoffKind !== expectedWorkflowHandoffKind) {
    const failureExplanation = `${input.primaryAssistantAgent.shortLabel} mode must record a ${expectedWorkflowHandoffKind} workflow handoff, received ${input.recordWorkflowHandoffToolCallRequest.workflowHandoff.handoffKind}.`;
    return {
      outcomeKind: "failed",
      failureExplanation,
      toolResultText: failureExplanation,
    };
  }

  input.recordWorkflowHandoff(input.recordWorkflowHandoffToolCallRequest.workflowHandoff);
  return {
    outcomeKind: "completed",
    toolResultText: `Recorded ${expectedWorkflowHandoffKind} workflow handoff.`,
  };
}
