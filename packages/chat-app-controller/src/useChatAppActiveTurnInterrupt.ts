import type { ActiveConversationTurn } from "@buli/engine";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ActiveConversationTurnShutdownCoordinator } from "./activeConversationTurnShutdown.ts";

const ACTIVE_TURN_INTERRUPT_CONFIRMATION_WINDOW_MS = 5_000;

export type UseChatAppActiveTurnInterruptInput = {
  activeConversationTurnShutdownCoordinator?: ActiveConversationTurnShutdownCoordinator | undefined;
  onActiveTurnInterruptConfirmationArmedChanged?: ((isActiveTurnInterruptConfirmationArmed: boolean) => void) | undefined;
};

export type UseChatAppActiveTurnInterruptResult = {
  isActiveTurnInterruptConfirmationArmed: boolean;
  getActiveConversationTurn: () => ActiveConversationTurn | undefined;
  registerActiveConversationTurnStarted: (activeConversationTurn: ActiveConversationTurn) => void;
  registerActiveConversationTurnFinished: () => void;
  registerActiveConversationTurnSettlement: (activeConversationTurnSettlementPromise: Promise<unknown>) => void;
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
    input.onActiveTurnInterruptConfirmationArmedChanged?.(false);
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
      input.onActiveTurnInterruptConfirmationArmedChanged?.(false);
      setIsActiveTurnInterruptConfirmationArmed(false);
    }, ACTIVE_TURN_INTERRUPT_CONFIRMATION_WINDOW_MS);
    input.onActiveTurnInterruptConfirmationArmedChanged?.(true);
    setIsActiveTurnInterruptConfirmationArmed(true);
  });

  const getActiveConversationTurn = useEffectEvent((): ActiveConversationTurn | undefined =>
    latestActiveConversationTurnRef.current
  );

  const registerActiveConversationTurnStarted = useEffectEvent((activeConversationTurn: ActiveConversationTurn): void => {
    latestActiveConversationTurnRef.current = activeConversationTurn;
    hasActiveTurnInterruptBeenRequestedRef.current = false;
    input.activeConversationTurnShutdownCoordinator?.registerActiveConversationTurn(
      activeConversationTurn,
    );
  });

  const registerActiveConversationTurnFinished = useEffectEvent((): void => {
    const activeConversationTurn = latestActiveConversationTurnRef.current;
    if (activeConversationTurn) {
      input.activeConversationTurnShutdownCoordinator?.clearActiveConversationTurn(activeConversationTurn);
    }
    latestActiveConversationTurnRef.current = undefined;
    hasActiveTurnInterruptBeenRequestedRef.current = false;
    clearActiveTurnInterruptConfirmation();
  });

  const registerActiveConversationTurnSettlement = useEffectEvent((
    activeConversationTurnSettlementPromise: Promise<unknown>,
  ): void => {
    input.activeConversationTurnShutdownCoordinator?.registerActiveConversationTurnSettlement(
      activeConversationTurnSettlementPromise,
    );
  });

  const requestActiveConversationTurnInterrupt = useEffectEvent((): void => {
    const activeConversationTurn = latestActiveConversationTurnRef.current;
    if (!activeConversationTurn) {
      return;
    }

    if (hasActiveTurnInterruptBeenRequestedRef.current) {
      return;
    }

    const now = Date.now();
    const confirmationExpiresAtMs = activeTurnInterruptConfirmationExpiresAtMsRef.current;
    if (confirmationExpiresAtMs !== undefined && now <= confirmationExpiresAtMs) {
      hasActiveTurnInterruptBeenRequestedRef.current = true;
      if (input.activeConversationTurnShutdownCoordinator) {
        input.activeConversationTurnShutdownCoordinator.interruptActiveConversationTurn();
      } else {
        activeConversationTurn.interrupt();
      }
      clearActiveTurnInterruptConfirmation();
      return;
    }

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
