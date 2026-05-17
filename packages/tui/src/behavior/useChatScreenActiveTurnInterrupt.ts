import type { BuliDiagnosticLogger } from "@buli/contracts";
import type { ActiveConversationTurn } from "@buli/engine";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ActiveConversationTurnShutdownCoordinator } from "../activeConversationTurnShutdown.ts";
import { logTuiDiagnosticEvent as logChatScreenDiagnosticEvent } from "../diagnostics/logTuiDiagnosticEvent.ts";

const ACTIVE_TURN_INTERRUPT_CONFIRMATION_WINDOW_MS = 5_000;

export type UseChatScreenActiveTurnInterruptInput = {
  activeConversationTurnShutdownCoordinator?: ActiveConversationTurnShutdownCoordinator | undefined;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type StartedChatScreenActiveTurn = {
  activeConversationTurn: ActiveConversationTurn;
  selectedModelId: string;
};

export type FinishedChatScreenActiveTurn = {
  selectedModelId: string;
};

export type UseChatScreenActiveTurnInterruptResult = {
  isActiveTurnInterruptConfirmationArmed: boolean;
  getActiveConversationTurn: () => ActiveConversationTurn | undefined;
  registerActiveConversationTurnStarted: (startedActiveConversationTurn: StartedChatScreenActiveTurn) => void;
  registerActiveConversationTurnFinished: (finishedActiveConversationTurn: FinishedChatScreenActiveTurn) => void;
  registerActiveConversationTurnSettlement: (activeConversationTurnSettlementPromise: Promise<void>) => void;
  requestActiveConversationTurnInterrupt: () => void;
};

export function useChatScreenActiveTurnInterrupt(
  input: UseChatScreenActiveTurnInterruptInput,
): UseChatScreenActiveTurnInterruptResult {
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
    startedActiveConversationTurn: StartedChatScreenActiveTurn,
  ): void => {
    latestActiveConversationTurnRef.current = startedActiveConversationTurn.activeConversationTurn;
    hasActiveTurnInterruptBeenRequestedRef.current = false;
    input.activeConversationTurnShutdownCoordinator?.registerActiveConversationTurn(
      startedActiveConversationTurn.activeConversationTurn,
    );
    logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.active_turn_set", {
      selectedModelId: startedActiveConversationTurn.selectedModelId,
    });
  });

  const registerActiveConversationTurnFinished = useEffectEvent((
    finishedActiveConversationTurn: FinishedChatScreenActiveTurn,
  ): void => {
    const activeConversationTurn = latestActiveConversationTurnRef.current;
    if (activeConversationTurn) {
      input.activeConversationTurnShutdownCoordinator?.clearActiveConversationTurn(activeConversationTurn);
    }
    latestActiveConversationTurnRef.current = undefined;
    hasActiveTurnInterruptBeenRequestedRef.current = false;
    clearActiveTurnInterruptConfirmation();
    logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.active_turn_cleared", {
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
      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.active_turn_interrupt_ignored", {
        reason: "no_active_turn",
      });
      return;
    }

    if (hasActiveTurnInterruptBeenRequestedRef.current) {
      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.active_turn_interrupt_ignored", {
        reason: "interrupt_already_requested",
      });
      return;
    }

    const now = Date.now();
    const confirmationExpiresAtMs = activeTurnInterruptConfirmationExpiresAtMsRef.current;
    if (confirmationExpiresAtMs !== undefined && now <= confirmationExpiresAtMs) {
      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.active_turn_interrupt_confirmed", {
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

    logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.active_turn_interrupt_armed", {
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
