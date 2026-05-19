import type { BuliDiagnosticLogger } from "@buli/contracts";
import type { ActiveConversationTurn } from "@buli/engine";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ActiveConversationTurnShutdownCoordinator } from "./activeConversationTurnShutdown.ts";
import { logChatAppControllerDiagnosticEvent } from "./diagnostics.ts";

const ACTIVE_TURN_INTERRUPT_CONFIRMATION_WINDOW_MS = 5_000;

export type UseChatAppActiveTurnInterruptInput = {
  activeConversationTurnShutdownCoordinator?: ActiveConversationTurnShutdownCoordinator | undefined;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type StartedChatAppActiveTurn = {
  activeConversationTurn: ActiveConversationTurn;
  selectedModelId: string;
};

export type FinishedChatAppActiveTurn = {
  selectedModelId: string;
};

export type UseChatAppActiveTurnInterruptResult = {
  isActiveTurnInterruptConfirmationArmed: boolean;
  getActiveConversationTurn: () => ActiveConversationTurn | undefined;
  registerActiveConversationTurnStarted: (startedActiveConversationTurn: StartedChatAppActiveTurn) => void;
  registerActiveConversationTurnFinished: (finishedActiveConversationTurn: FinishedChatAppActiveTurn) => void;
  registerActiveConversationTurnSettlement: (activeConversationTurnSettlementPromise: Promise<void>) => void;
  requestActiveConversationTurnInterrupt: () => void;
};

export function useChatAppActiveTurnInterrupt(
  input: UseChatAppActiveTurnInterruptInput,
): UseChatAppActiveTurnInterruptResult {
  const [isActiveTurnInterruptConfirmationArmed, setIsActiveTurnInterruptConfirmationArmed] = useState(false);
  const latestActiveConversationTurnRef = useRef<ActiveConversationTurn | undefined>(undefined);
  const activeTurnInterruptConfirmationExpiresAtMsRef = useRef<number | undefined>(undefined);
  const activeTurnInterruptConfirmationTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasActiveTurnInterruptBeenRequestedRef = useRef(false);

  const clearActiveTurnInterruptConfirmation = useEffectEvent((): void => {
    activeTurnInterruptConfirmationExpiresAtMsRef.current = undefined;
    if (activeTurnInterruptConfirmationTimeoutRef.current !== undefined) {
      clearTimeout(activeTurnInterruptConfirmationTimeoutRef.current);
      activeTurnInterruptConfirmationTimeoutRef.current = undefined;
    }
    setIsActiveTurnInterruptConfirmationArmed(false);
  });

  const armActiveTurnInterruptConfirmation = useEffectEvent((armedAtMs: number): void => {
    activeTurnInterruptConfirmationExpiresAtMsRef.current = armedAtMs + ACTIVE_TURN_INTERRUPT_CONFIRMATION_WINDOW_MS;
    if (activeTurnInterruptConfirmationTimeoutRef.current !== undefined) {
      clearTimeout(activeTurnInterruptConfirmationTimeoutRef.current);
    }
    activeTurnInterruptConfirmationTimeoutRef.current = setTimeout(() => {
      activeTurnInterruptConfirmationExpiresAtMsRef.current = undefined;
      activeTurnInterruptConfirmationTimeoutRef.current = undefined;
      setIsActiveTurnInterruptConfirmationArmed(false);
    }, ACTIVE_TURN_INTERRUPT_CONFIRMATION_WINDOW_MS);
    setIsActiveTurnInterruptConfirmationArmed(true);
  });

  const getActiveConversationTurn = useEffectEvent((): ActiveConversationTurn | undefined =>
    latestActiveConversationTurnRef.current
  );

  const registerActiveConversationTurnStarted = useEffectEvent((
    startedActiveConversationTurn: StartedChatAppActiveTurn,
  ): void => {
    latestActiveConversationTurnRef.current = startedActiveConversationTurn.activeConversationTurn;
    hasActiveTurnInterruptBeenRequestedRef.current = false;
    input.activeConversationTurnShutdownCoordinator?.registerActiveConversationTurn(
      startedActiveConversationTurn.activeConversationTurn,
    );
    logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.active_turn_set", {
      selectedModelId: startedActiveConversationTurn.selectedModelId,
    });
  });

  const registerActiveConversationTurnFinished = useEffectEvent((
    finishedActiveConversationTurn: FinishedChatAppActiveTurn,
  ): void => {
    const activeConversationTurn = latestActiveConversationTurnRef.current;
    if (activeConversationTurn) {
      input.activeConversationTurnShutdownCoordinator?.clearActiveConversationTurn(activeConversationTurn);
    }
    latestActiveConversationTurnRef.current = undefined;
    hasActiveTurnInterruptBeenRequestedRef.current = false;
    clearActiveTurnInterruptConfirmation();
    logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.active_turn_cleared", {
      selectedModelId: finishedActiveConversationTurn.selectedModelId,
    });
  });

  const registerActiveConversationTurnSettlement = useEffectEvent((
    activeConversationTurnSettlementPromise: Promise<void>,
  ): void => {
    input.activeConversationTurnShutdownCoordinator?.registerActiveConversationTurnSettlement(
      activeConversationTurnSettlementPromise,
    );
  });

  const requestActiveConversationTurnInterrupt = useEffectEvent((): void => {
    const activeConversationTurn = latestActiveConversationTurnRef.current;
    if (!activeConversationTurn) {
      logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.active_turn_interrupt_ignored", {
        reason: "no_active_turn",
      });
      return;
    }

    if (hasActiveTurnInterruptBeenRequestedRef.current) {
      logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.active_turn_interrupt_ignored", {
        reason: "interrupt_already_requested",
      });
      return;
    }

    const now = Date.now();
    const confirmationExpiresAtMs = activeTurnInterruptConfirmationExpiresAtMsRef.current;
    if (confirmationExpiresAtMs !== undefined && now <= confirmationExpiresAtMs) {
      logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.active_turn_interrupt_confirmed", {
        confirmationWindowMs: ACTIVE_TURN_INTERRUPT_CONFIRMATION_WINDOW_MS,
      });
      hasActiveTurnInterruptBeenRequestedRef.current = true;
      if (input.activeConversationTurnShutdownCoordinator) {
        input.activeConversationTurnShutdownCoordinator.interruptActiveConversationTurn();
      } else {
        activeConversationTurn.interrupt();
      }
      clearActiveTurnInterruptConfirmation();
      return;
    }

    logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.active_turn_interrupt_armed", {
      confirmationWindowMs: ACTIVE_TURN_INTERRUPT_CONFIRMATION_WINDOW_MS,
    });
    armActiveTurnInterruptConfirmation(now);
  });

  useEffect(
    () => () => {
      if (activeTurnInterruptConfirmationTimeoutRef.current !== undefined) {
        clearTimeout(activeTurnInterruptConfirmationTimeoutRef.current);
      }
    },
    [],
  );

  return {
    isActiveTurnInterruptConfirmationArmed,
    getActiveConversationTurn,
    registerActiveConversationTurnStarted,
    registerActiveConversationTurnFinished,
    registerActiveConversationTurnSettlement,
    requestActiveConversationTurnInterrupt,
  };
}
