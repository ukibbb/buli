import { expect, test } from "bun:test";
import type { ActiveConversationTurn } from "@buli/engine";
import {
  ActiveConversationTurnShutdownCoordinator,
  useChatAppActiveTurnInterrupt,
  type UseChatAppActiveTurnInterruptResult,
} from "@buli/chat-app-controller";
import { act } from "react";
import { testRender } from "./testRenderWithCleanup.ts";

type RenderedActiveTurnInterruptHook = {
  readCurrentHookResult: () => UseChatAppActiveTurnInterruptResult;
};

type ActiveTurnInterruptHookProbeProps = {
  activeConversationTurnShutdownCoordinator?: ActiveConversationTurnShutdownCoordinator;
  observeHookResult: (hookResult: UseChatAppActiveTurnInterruptResult) => void;
};

async function renderActiveTurnInterruptHook(input: {
  activeConversationTurnShutdownCoordinator?: ActiveConversationTurnShutdownCoordinator;
} = {}): Promise<RenderedActiveTurnInterruptHook> {
  let latestHookResult: UseChatAppActiveTurnInterruptResult | undefined;

  await testRender(
    <ActiveTurnInterruptHookProbe
      observeHookResult={(hookResult) => {
        latestHookResult = hookResult;
      }}
      {...(input.activeConversationTurnShutdownCoordinator
        ? { activeConversationTurnShutdownCoordinator: input.activeConversationTurnShutdownCoordinator }
        : {})}
    />,
  );

  return {
    readCurrentHookResult(): UseChatAppActiveTurnInterruptResult {
      if (!latestHookResult) {
        throw new Error("Active turn interrupt hook did not render.");
      }

      return latestHookResult;
    },
  };
}

function ActiveTurnInterruptHookProbe(props: ActiveTurnInterruptHookProbeProps) {
  const hookResult = useChatAppActiveTurnInterrupt({
    ...(props.activeConversationTurnShutdownCoordinator
      ? { activeConversationTurnShutdownCoordinator: props.activeConversationTurnShutdownCoordinator }
      : {}),
  });

  props.observeHookResult(hookResult);

  return <box />;
}

test("requestActiveConversationTurnInterrupt requires a confirmation press before interrupting", async () => {
  const activeConversationTurn = createCountingActiveConversationTurn();
  const renderedHook = await renderActiveTurnInterruptHook();

  await act(async () => {
    renderedHook.readCurrentHookResult().registerActiveConversationTurnStarted(activeConversationTurn.activeConversationTurn);
  });

  expect(renderedHook.readCurrentHookResult().getActiveConversationTurn()).toBe(
    activeConversationTurn.activeConversationTurn,
  );

  await act(async () => {
    renderedHook.readCurrentHookResult().requestActiveConversationTurnInterrupt();
  });

  expect(activeConversationTurn.getInterruptCount()).toBe(0);
  expect(renderedHook.readCurrentHookResult().isActiveTurnInterruptConfirmationArmed).toBe(true);

  await act(async () => {
    renderedHook.readCurrentHookResult().requestActiveConversationTurnInterrupt();
  });

  expect(activeConversationTurn.getInterruptCount()).toBe(1);
  expect(renderedHook.readCurrentHookResult().isActiveTurnInterruptConfirmationArmed).toBe(false);

  await act(async () => {
    renderedHook.readCurrentHookResult().requestActiveConversationTurnInterrupt();
  });

  expect(activeConversationTurn.getInterruptCount()).toBe(1);
});

test("registerActiveConversationTurnFinished clears confirmation and allows a later active turn", async () => {
  const firstActiveConversationTurn = createCountingActiveConversationTurn();
  const secondActiveConversationTurn = createCountingActiveConversationTurn();
  const renderedHook = await renderActiveTurnInterruptHook();

  await act(async () => {
    renderedHook.readCurrentHookResult().registerActiveConversationTurnStarted(firstActiveConversationTurn.activeConversationTurn);
    renderedHook.readCurrentHookResult().requestActiveConversationTurnInterrupt();
  });

  expect(renderedHook.readCurrentHookResult().isActiveTurnInterruptConfirmationArmed).toBe(true);

  await act(async () => {
    renderedHook.readCurrentHookResult().registerActiveConversationTurnFinished();
  });

  expect(renderedHook.readCurrentHookResult().getActiveConversationTurn()).toBeUndefined();
  expect(renderedHook.readCurrentHookResult().isActiveTurnInterruptConfirmationArmed).toBe(false);

  await act(async () => {
    renderedHook.readCurrentHookResult().registerActiveConversationTurnStarted(secondActiveConversationTurn.activeConversationTurn);
    renderedHook.readCurrentHookResult().requestActiveConversationTurnInterrupt();
    renderedHook.readCurrentHookResult().requestActiveConversationTurnInterrupt();
  });

  expect(firstActiveConversationTurn.getInterruptCount()).toBe(0);
  expect(secondActiveConversationTurn.getInterruptCount()).toBe(1);
});

test("registerActiveConversationTurnStarted makes the active turn available to the shutdown coordinator", async () => {
  const shutdownCoordinator = new ActiveConversationTurnShutdownCoordinator();
  const activeConversationTurn = createCountingActiveConversationTurn();
  const renderedHook = await renderActiveTurnInterruptHook({
    activeConversationTurnShutdownCoordinator: shutdownCoordinator,
  });

  await act(async () => {
    renderedHook.readCurrentHookResult().registerActiveConversationTurnStarted(activeConversationTurn.activeConversationTurn);
  });

  expect(shutdownCoordinator.interruptActiveConversationTurn()).toBe(true);
  expect(activeConversationTurn.getInterruptCount()).toBe(1);

  await act(async () => {
    renderedHook.readCurrentHookResult().registerActiveConversationTurnFinished();
  });

  expect(shutdownCoordinator.interruptActiveConversationTurn()).toBe(false);
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
