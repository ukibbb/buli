import { expect, test } from "bun:test";
import {
  RuntimeConversationTurnLifecycle,
  USER_INTERRUPTED_CONVERSATION_TURN_REASON,
} from "../src/runtimeConversationTurnLifecycle.ts";

test("RuntimeConversationTurnLifecycle allows the assistant event stream to start once", () => {
  const runtimeConversationTurnLifecycle = new RuntimeConversationTurnLifecycle({
    conversationTurnId: "conversation-turn-1",
    selectedModelId: "gpt-5.4",
    onConversationTurnFinished: () => {},
    hasPendingToolApproval: () => false,
    resolvePendingToolApprovalAsInterrupted: () => {},
  });

  runtimeConversationTurnLifecycle.markAssistantResponseEventStreamStarted();

  expect(() => runtimeConversationTurnLifecycle.markAssistantResponseEventStreamStarted()).toThrow(
    "Conversation turn events can only be streamed once",
  );
});

test("RuntimeConversationTurnLifecycle interrupts once and aborts the turn signal", () => {
  let interruptedApprovalCount = 0;
  const runtimeConversationTurnLifecycle = new RuntimeConversationTurnLifecycle({
    conversationTurnId: "conversation-turn-1",
    selectedModelId: "gpt-5.4",
    onConversationTurnFinished: () => {},
    hasPendingToolApproval: () => true,
    resolvePendingToolApprovalAsInterrupted: () => {
      interruptedApprovalCount += 1;
    },
  });

  runtimeConversationTurnLifecycle.interrupt();
  runtimeConversationTurnLifecycle.interrupt();

  expect(interruptedApprovalCount).toBe(1);
  expect(runtimeConversationTurnLifecycle.abortSignal.aborted).toBe(true);
  expect(runtimeConversationTurnLifecycle.hasInterruptedTurn()).toBe(true);
});

test("RuntimeConversationTurnLifecycle finishes once", () => {
  let finishedCount = 0;
  const runtimeConversationTurnLifecycle = new RuntimeConversationTurnLifecycle({
    conversationTurnId: "conversation-turn-1",
    selectedModelId: "gpt-5.4",
    onConversationTurnFinished: () => {
      finishedCount += 1;
    },
    hasPendingToolApproval: () => false,
    resolvePendingToolApprovalAsInterrupted: () => {},
  });

  runtimeConversationTurnLifecycle.finish({ conversationTurnStartedAtMilliseconds: Date.now() });
  runtimeConversationTurnLifecycle.finish({ conversationTurnStartedAtMilliseconds: Date.now() });

  expect(finishedCount).toBe(1);
  expect(runtimeConversationTurnLifecycle.hasFinishedTurn()).toBe(true);
});

test("RuntimeConversationTurnLifecycle throws after interruption", () => {
  const runtimeConversationTurnLifecycle = new RuntimeConversationTurnLifecycle({
    conversationTurnId: "conversation-turn-1",
    selectedModelId: "gpt-5.4",
    onConversationTurnFinished: () => {},
    hasPendingToolApproval: () => false,
    resolvePendingToolApprovalAsInterrupted: () => {},
  });

  runtimeConversationTurnLifecycle.interrupt();

  expect(() => runtimeConversationTurnLifecycle.throwIfInterrupted()).toThrow(
    USER_INTERRUPTED_CONVERSATION_TURN_REASON,
  );
});
