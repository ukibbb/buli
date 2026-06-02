import type { ToolCallDetail } from "@buli/contracts";

export type CompletedToolCallOutcome = {
  outcomeKind: "completed";
  toolCallDetail: ToolCallDetail;
  toolResultText: string;
  providerVisibleToolResultText?: string;
  durationMilliseconds: number;
};

export type FailedToolCallOutcome = {
  outcomeKind: "failed";
  toolCallDetail: ToolCallDetail;
  toolResultText: string;
  providerVisibleToolResultText?: string;
  failureExplanation: string;
  durationMilliseconds: number;
};

export type ToolCallOutcome = CompletedToolCallOutcome | FailedToolCallOutcome;
