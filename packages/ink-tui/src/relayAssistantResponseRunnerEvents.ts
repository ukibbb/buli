import type { AssistantResponseEvent } from "@buli/contracts";
import type { AssistantResponseRequest, AssistantResponseRunner } from "@buli/engine";

export async function relayAssistantResponseRunnerEvents(input: {
  assistantResponseRunner: AssistantResponseRunner;
  assistantResponseRequest: AssistantResponseRequest;
  onAssistantResponseEvent: (assistantResponseEvent: AssistantResponseEvent) => void;
}): Promise<void> {
  try {
    for await (const assistantResponseEvent of input.assistantResponseRunner.streamAssistantResponse(
      input.assistantResponseRequest,
    )) {
      input.onAssistantResponseEvent(assistantResponseEvent);
    }
  } catch (error) {
    input.onAssistantResponseEvent({
      type: "assistant_response_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
