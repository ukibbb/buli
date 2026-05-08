import type { ToolCallDetail } from "@buli/contracts";

export type CompletedToolCallOutcome = {
  outcomeKind: "completed";
  toolCallDetail: ToolCallDetail;
  toolResultText: string;
  durationMilliseconds: number;
};

export type FailedToolCallOutcome = {
  outcomeKind: "failed";
  toolCallDetail: ToolCallDetail;
  toolResultText: string;
  failureExplanation: string;
  durationMilliseconds: number;
};

export type ToolCallOutcome = CompletedToolCallOutcome | FailedToolCallOutcome;
