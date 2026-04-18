import type { AssistantResponseEvent } from "@buli/contracts";
import type { ActiveConversationTurn, AssistantConversationRunner, ConversationTurnRequest } from "@buli/engine";

export async function relayAssistantResponseRunnerEvents(input: {
  assistantConversationRunner: AssistantConversationRunner;
  conversationTurnRequest: ConversationTurnRequest;
  onConversationTurnStarted: (activeConversationTurn: ActiveConversationTurn) => void;
  onConversationTurnFinished: () => void;
  onAssistantResponseEvent: (assistantResponseEvent: AssistantResponseEvent) => void;
}): Promise<void> {
  const activeConversationTurn = input.assistantConversationRunner.startConversationTurn(input.conversationTurnRequest);
  input.onConversationTurnStarted(activeConversationTurn);

  try {
    for await (const assistantResponseEvent of activeConversationTurn.streamAssistantResponseEvents()) {
      input.onAssistantResponseEvent(assistantResponseEvent);
    }
  } catch (error) {
    input.onAssistantResponseEvent({
      type: "assistant_response_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    input.onConversationTurnFinished();
  }
}
