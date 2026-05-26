import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type SkillToolCallRequest,
} from "@buli/contracts";
import type { ProviderConversationTurn } from "./provider.ts";
import { logAssistantResponseEventEmitted, submitProviderToolResultWithDiagnostics } from "./runtimeToolCallExecutionDiagnostics.ts";
import type { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import type { WorkspaceSkillCatalog } from "./skills/skillCatalog.ts";
import { createStartedSkillToolCallDetail, runSkillToolCall } from "./tools/skillTool.ts";

export type StreamAssistantResponseEventsForSkillToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  conversationTurnId: string;
  toolCallId: string;
  skillToolCallRequest: SkillToolCallRequest;
  skillCatalog: WorkspaceSkillCatalog;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export async function* streamAssistantResponseEventsForSkillToolCall(
  input: StreamAssistantResponseEventsForSkillToolCallInput,
): AsyncGenerator<AssistantResponseEvent> {
  const toolCallPartId = randomUUID();
  const toolCallStartedAtMs = Date.now();
  const startedToolCallDetail = createStartedSkillToolCallDetail(input.skillToolCallRequest);

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
  const skillToolCallOutcome = await runSkillToolCall({
    skillToolCallRequest: input.skillToolCallRequest,
    skillCatalog: input.skillCatalog,
  });
  input.throwIfConversationTurnInterrupted();

  if (skillToolCallOutcome.outcomeKind === "completed") {
    input.toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: skillToolCallOutcome.toolCallDetail,
      toolResultText: skillToolCallOutcome.toolResultText,
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
        toolCallDetail: skillToolCallOutcome.toolCallDetail,
        durationMs: skillToolCallOutcome.durationMilliseconds,
      }),
    }));
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      conversationTurnId: input.conversationTurnId,
      toolCallId: input.toolCallId,
      toolResultText: skillToolCallOutcome.toolResultText,
      toolResultKind: "completed",
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
    toolCallId: input.toolCallId,
    toolCallDetail: skillToolCallOutcome.toolCallDetail,
    toolResultText: skillToolCallOutcome.toolResultText,
    failureExplanation: skillToolCallOutcome.failureExplanation,
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
      toolCallDetail: skillToolCallOutcome.toolCallDetail,
      errorText: skillToolCallOutcome.failureExplanation,
      durationMs: skillToolCallOutcome.durationMilliseconds,
    }),
  }));
  await submitProviderToolResultWithDiagnostics({
    providerConversationTurn: input.providerConversationTurn,
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    toolResultText: skillToolCallOutcome.toolResultText,
    toolResultKind: "failed",
    diagnosticLogger: input.diagnosticLogger,
  });
}
