import type {
  AssistantContentPart,
  AssistantResponseEvent,
  PlanStep,
  TokenUsage,
  ToolCallDetail,
} from "@buli/contracts";

// A fixture does not exercise a reducer; it declares an event sequence and
// the transcript-entry shape each TUI's reducer should arrive at. The exact
// shape of the expected entries here is a narrow subset — it asserts the
// discriminator and the data that is semantically derivable from the events,
// not fields each TUI computes locally (timestamps, randomly-generated ids).
export type ExpectedConversationTranscriptEntryShape =
  | {
      kind: "message";
      role: "user" | "assistant";
      text: string;
      assistantContentParts?: readonly AssistantContentPart[];
    }
  | { kind: "error"; text: string }
  | { kind: "incomplete_response_notice"; incompleteReason: string }
  | { kind: "streaming_reasoning_summary"; reasoningSummaryText: string }
  | {
      kind: "completed_reasoning_summary";
      reasoningSummaryText: string;
      reasoningDurationMs: number;
      reasoningTokenCount?: number;
    }
  | { kind: "streaming_tool_call"; toolCallId: string; toolCallDetail: ToolCallDetail }
  | {
      kind: "completed_tool_call";
      toolCallId: string;
      toolCallDetail: ToolCallDetail;
      durationMs: number;
    }
  | {
      kind: "failed_tool_call";
      toolCallId: string;
      toolCallDetail: ToolCallDetail;
      errorText: string;
      durationMs: number;
    }
  | {
      kind: "plan_proposal";
      planId: string;
      planTitle: string;
      planSteps: readonly PlanStep[];
    }
  | {
      kind: "rate_limit_notice";
      retryAfterSeconds: number;
      limitExplanation: string;
    }
  | {
      kind: "tool_approval_request";
      approvalId: string;
      pendingToolCallId: string;
      pendingToolCallDetail: ToolCallDetail;
      riskExplanation: string;
    }
  | {
      kind: "turn_footer";
      turnDurationMs: number;
      usage?: TokenUsage;
      modelDisplayName: string;
    };

export type AssistantTranscriptScenario = {
  scenarioName: string;
  responseEventSequence: readonly AssistantResponseEvent[];
  expectedConversationTranscriptEntries: readonly ExpectedConversationTranscriptEntryShape[];
};
