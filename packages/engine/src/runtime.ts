import {
  AssistantPlanProposedEventSchema,
  AssistantRateLimitPendingEventSchema,
  AssistantReasoningSummaryCompletedEventSchema,
  AssistantReasoningSummaryStartedEventSchema,
  AssistantReasoningSummaryTextChunkEventSchema,
  AssistantResponseFailedEventSchema,
  AssistantResponseIncompleteEventSchema,
  AssistantResponseStartedEventSchema,
  AssistantResponseTextChunkEventSchema,
  AssistantToolApprovalRequestedEventSchema,
  AssistantToolCallCompletedEventSchema,
  AssistantToolCallFailedEventSchema,
  AssistantToolCallStartedEventSchema,
  AssistantTurnCompletedEventSchema,
  type AssistantResponseEvent,
} from "@buli/contracts";
import type { AssistantResponseRequest, AssistantResponseProvider } from "./provider.ts";
import { createCompletedAssistantResponseEvent } from "./turn.ts";

export interface AssistantResponseRunner {
  streamAssistantResponse(input: AssistantResponseRequest): AsyncIterable<AssistantResponseEvent>;
}

export class AssistantResponseRuntime implements AssistantResponseRunner {
  readonly provider: AssistantResponseProvider;

  constructor(provider: AssistantResponseProvider) {
    this.provider = provider;
  }

  async *streamAssistantResponse(input: AssistantResponseRequest): AsyncGenerator<AssistantResponseEvent> {
    // The runtime converts provider-specific stream updates into neutral
    // assistant-response events. That keeps the engine usable without Ink
    // and keeps the provider boundary simple to test.
    yield AssistantResponseStartedEventSchema.parse({
      type: "assistant_response_started",
      model: input.selectedModelId,
    });

    let streamedAssistantText = "";

    try {
      for await (const providerStreamEvent of this.provider.streamAssistantResponse(input)) {
        if (providerStreamEvent.type === "reasoning_summary_started") {
          yield AssistantReasoningSummaryStartedEventSchema.parse({
            type: "assistant_reasoning_summary_started",
          });
          continue;
        }

        if (providerStreamEvent.type === "reasoning_summary_text_chunk") {
          yield AssistantReasoningSummaryTextChunkEventSchema.parse({
            type: "assistant_reasoning_summary_text_chunk",
            text: providerStreamEvent.text,
          });
          continue;
        }

        if (providerStreamEvent.type === "reasoning_summary_completed") {
          yield AssistantReasoningSummaryCompletedEventSchema.parse({
            type: "assistant_reasoning_summary_completed",
            reasoningDurationMs: providerStreamEvent.reasoningDurationMs,
          });
          continue;
        }

        if (providerStreamEvent.type === "text_chunk") {
          streamedAssistantText += providerStreamEvent.text;
          yield AssistantResponseTextChunkEventSchema.parse({
            type: "assistant_response_text_chunk",
            text: providerStreamEvent.text,
          });
          continue;
        }

        if (providerStreamEvent.type === "tool_call_started") {
          yield AssistantToolCallStartedEventSchema.parse({
            type: "assistant_tool_call_started",
            toolCallId: providerStreamEvent.toolCallId,
            toolCallDetail: providerStreamEvent.toolCallDetail,
          });
          continue;
        }

        if (providerStreamEvent.type === "tool_call_completed") {
          yield AssistantToolCallCompletedEventSchema.parse({
            type: "assistant_tool_call_completed",
            toolCallId: providerStreamEvent.toolCallId,
            toolCallDetail: providerStreamEvent.toolCallDetail,
            durationMs: providerStreamEvent.durationMs,
          });
          continue;
        }

        if (providerStreamEvent.type === "tool_call_failed") {
          yield AssistantToolCallFailedEventSchema.parse({
            type: "assistant_tool_call_failed",
            toolCallId: providerStreamEvent.toolCallId,
            toolCallDetail: providerStreamEvent.toolCallDetail,
            errorText: providerStreamEvent.errorText,
            durationMs: providerStreamEvent.durationMs,
          });
          continue;
        }

        if (providerStreamEvent.type === "rate_limit_pending") {
          yield AssistantRateLimitPendingEventSchema.parse({
            type: "assistant_rate_limit_pending",
            retryAfterSeconds: providerStreamEvent.retryAfterSeconds,
            limitExplanation: providerStreamEvent.limitExplanation,
          });
          continue;
        }

        if (providerStreamEvent.type === "tool_approval_requested") {
          yield AssistantToolApprovalRequestedEventSchema.parse({
            type: "assistant_tool_approval_requested",
            approvalId: providerStreamEvent.approvalId,
            pendingToolCallId: providerStreamEvent.pendingToolCallId,
            pendingToolCallDetail: providerStreamEvent.pendingToolCallDetail,
            riskExplanation: providerStreamEvent.riskExplanation,
          });
          continue;
        }

        if (providerStreamEvent.type === "plan_proposed") {
          yield AssistantPlanProposedEventSchema.parse({
            type: "assistant_plan_proposed",
            planId: providerStreamEvent.planId,
            planTitle: providerStreamEvent.planTitle,
            planSteps: providerStreamEvent.planSteps,
          });
          continue;
        }

        if (providerStreamEvent.type === "turn_completed") {
          // A turn_completed frame is cosmetic: the UI uses it to pin a
          // TurnFooter. Authoritative token usage arrives later on the terminal
          // completed or incomplete response event, so this event only carries
          // the display metadata the footer can show immediately.
          yield AssistantTurnCompletedEventSchema.parse({
            type: "assistant_turn_completed",
            turnDurationMs: providerStreamEvent.turnDurationMs,
            modelDisplayName: providerStreamEvent.modelDisplayName,
          });
          continue;
        }

        if (providerStreamEvent.type === "incomplete") {
          yield AssistantResponseIncompleteEventSchema.parse({
            type: "assistant_response_incomplete",
            incompleteReason: providerStreamEvent.incompleteReason,
            usage: providerStreamEvent.usage,
          });
          return;
        }

        // Remaining arm: providerStreamEvent.type === "completed".
        yield createCompletedAssistantResponseEvent({
          assistantText: streamedAssistantText,
          usage: providerStreamEvent.usage,
        });
        return;
      }

      yield AssistantResponseFailedEventSchema.parse({
        type: "assistant_response_failed",
        error: "Provider stream ended before completion",
      });
    } catch (error) {
      yield AssistantResponseFailedEventSchema.parse({
        type: "assistant_response_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
