import type { ActiveConversationTurn } from "@buli/engine";

export class ActiveConversationTurnShutdownCoordinator {
  private activeConversationTurn: ActiveConversationTurn | undefined;
  private activeConversationTurnSettlementPromise: Promise<void> | undefined;
  private hasActiveConversationTurnInterruptBeenRequested = false;

  registerActiveConversationTurn(activeConversationTurn: ActiveConversationTurn): void {
    this.activeConversationTurn = activeConversationTurn;
    this.hasActiveConversationTurnInterruptBeenRequested = false;
  }

  registerActiveConversationTurnSettlement(activeConversationTurnSettlementPromise: Promise<void>): void {
    const trackedActiveConversationTurnSettlementPromise = activeConversationTurnSettlementPromise.finally(() => {
      if (this.activeConversationTurnSettlementPromise === trackedActiveConversationTurnSettlementPromise) {
        this.activeConversationTurnSettlementPromise = undefined;
      }
    });

    this.activeConversationTurnSettlementPromise = trackedActiveConversationTurnSettlementPromise;
  }

  clearActiveConversationTurn(activeConversationTurn: ActiveConversationTurn): void {
    if (this.activeConversationTurn !== activeConversationTurn) {
      return;
    }

    this.activeConversationTurn = undefined;
    this.hasActiveConversationTurnInterruptBeenRequested = false;
  }

  interruptActiveConversationTurn(): boolean {
    if (!this.activeConversationTurn || this.hasActiveConversationTurnInterruptBeenRequested) {
      return false;
    }

    this.hasActiveConversationTurnInterruptBeenRequested = true;
    this.activeConversationTurn.interrupt();
    return true;
  }

  async interruptActiveConversationTurnAndWaitForSettlement(): Promise<void> {
    this.interruptActiveConversationTurn();
    await this.activeConversationTurnSettlementPromise;
  }
}
