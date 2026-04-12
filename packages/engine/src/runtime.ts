import {
  AssistantStreamFailedEventSchema,
  AssistantStreamStartedEventSchema,
  AssistantTextDeltaEventSchema,
  type TurnEvent,
} from "@buli/contracts";
import type { TurnInput, TurnProvider } from "./provider.ts";
import { finishAssistantTurn } from "./turn.ts";

export class AgentRuntime {
  readonly provider: TurnProvider;

  constructor(provider: TurnProvider) {
    this.provider = provider;
  }

  async *runTurn(input: TurnInput): AsyncGenerator<TurnEvent> {
    // The runtime only speaks in neutral turn events. That keeps the engine
    // usable without Ink and makes the provider boundary easy to test directly.
    yield AssistantStreamStartedEventSchema.parse({
      type: "assistant_stream_started",
      model: input.model,
    });

    let text = "";

    try {
      for await (const event of this.provider.streamTurn(input)) {
        if (event.type === "text-delta") {
          text += event.text;
          yield AssistantTextDeltaEventSchema.parse({
            type: "assistant_text_delta",
            text: event.text,
          });
          continue;
        }

        yield finishAssistantTurn({
          text,
          usage: event.usage,
        });
        return;
      }

      yield AssistantStreamFailedEventSchema.parse({
        type: "assistant_stream_failed",
        error: "Provider stream ended before completion",
      });
    } catch (error) {
      yield AssistantStreamFailedEventSchema.parse({
        type: "assistant_stream_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
