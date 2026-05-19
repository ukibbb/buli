import { expect, test } from "bun:test";
import type { ActiveConversationTurn } from "@buli/engine";
import { ActiveConversationTurnShutdownCoordinator } from "../src/activeConversationTurnShutdown.ts";

test("interruptActiveConversationTurnAndWaitForSettlement is a no-op when no turn is active", async () => {
  const shutdownCoordinator = new ActiveConversationTurnShutdownCoordinator();

  await expect(shutdownCoordinator.interruptActiveConversationTurnAndWaitForSettlement()).resolves.toBeUndefined();
});

test("interruptActiveConversationTurn interrupts an active turn only once", () => {
  const shutdownCoordinator = new ActiveConversationTurnShutdownCoordinator();
  const activeConversationTurn = createCountingActiveConversationTurn();
  shutdownCoordinator.registerActiveConversationTurn(activeConversationTurn.activeConversationTurn);

  expect(shutdownCoordinator.interruptActiveConversationTurn()).toBe(true);
  expect(shutdownCoordinator.interruptActiveConversationTurn()).toBe(false);
  expect(activeConversationTurn.getInterruptCount()).toBe(1);
});

test("interruptActiveConversationTurnAndWaitForSettlement waits for the active turn relay to finish", async () => {
  const shutdownCoordinator = new ActiveConversationTurnShutdownCoordinator();
  const activeConversationTurn = createCountingActiveConversationTurn();
  let resolveSettlement: (() => void) | undefined;
  const settlementPromise = new Promise<void>((resolve) => {
    resolveSettlement = resolve;
  });
  shutdownCoordinator.registerActiveConversationTurn(activeConversationTurn.activeConversationTurn);
  shutdownCoordinator.registerActiveConversationTurnSettlement(settlementPromise);

  let hasShutdownSettled = false;
  const shutdownPromise = shutdownCoordinator.interruptActiveConversationTurnAndWaitForSettlement().then(() => {
    hasShutdownSettled = true;
  });
  await Promise.resolve();

  expect(activeConversationTurn.getInterruptCount()).toBe(1);
  expect(hasShutdownSettled).toBe(false);

  resolveSettlement?.();
  await shutdownPromise;
  expect(hasShutdownSettled).toBe(true);
});

function createCountingActiveConversationTurn(): {
  activeConversationTurn: ActiveConversationTurn;
  getInterruptCount: () => number;
} {
  let interruptCount = 0;
  return {
    activeConversationTurn: {
      async *streamAssistantResponseEvents() {},
      async approvePendingToolCall() {},
      async denyPendingToolCall() {},
      interrupt() {
        interruptCount += 1;
      },
    },
    getInterruptCount: () => interruptCount,
  };
}
