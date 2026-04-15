import {
  AssistantReasoningSummaryCompletedEventSchema,
  AssistantReasoningSummaryStartedEventSchema,
  AssistantReasoningSummaryTextChunkEventSchema,
  AssistantResponseFailedEventSchema,
  AssistantResponseStartedEventSchema,
  AssistantResponseTextChunkEventSchema,
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
      for await (const event of this.provider.streamAssistantResponse(input)) {
        if (event.type === "reasoning_summary_started") {
          yield AssistantReasoningSummaryStartedEventSchema.parse({
            type: "assistant_reasoning_summary_started",
          });
          continue;
        }

        if (event.type === "reasoning_summary_text_chunk") {
          yield AssistantReasoningSummaryTextChunkEventSchema.parse({
            type: "assistant_reasoning_summary_text_chunk",
            text: event.text,
          });
          continue;
        }

        if (event.type === "reasoning_summary_completed") {
          yield AssistantReasoningSummaryCompletedEventSchema.parse({
            type: "assistant_reasoning_summary_completed",
            reasoningDurationMs: event.reasoningDurationMs,
          });
          continue;
        }

        if (event.type === "text_chunk") {
          streamedAssistantText += event.text;
          yield AssistantResponseTextChunkEventSchema.parse({
            type: "assistant_response_text_chunk",
            text: event.text,
          });
          continue;
        }

        yield createCompletedAssistantResponseEvent({
          assistantText: streamedAssistantText,
          usage: event.usage,
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
