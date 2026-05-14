import type { BuliDiagnosticLogger, ToolCallDetail } from "@buli/contracts";
import type { InMemoryConversationHistory } from "./conversationHistory.ts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";

type CompletedToolResultSessionEntryInput = {
  toolCallId: string;
  toolCallDetail: ToolCallDetail;
  toolResultText: string;
};

type FailedToolResultSessionEntryInput = CompletedToolResultSessionEntryInput & {
  failureExplanation: string;
};

type DeniedToolResultSessionEntryInput = CompletedToolResultSessionEntryInput & {
  denialExplanation: string;
};

export class RuntimeToolResultSessionRecorder {
  readonly conversationHistory: InMemoryConversationHistory;
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;

  constructor(input: {
    conversationHistory: InMemoryConversationHistory;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  }) {
    this.conversationHistory = input.conversationHistory;
    this.diagnosticLogger = input.diagnosticLogger;
  }

  appendCompletedToolResultSessionEntry(input: CompletedToolResultSessionEntryInput): void {
    this.conversationHistory.appendConversationSessionEntry({
      entryKind: "completed_tool_result",
      toolCallId: input.toolCallId,
      toolCallDetail: input.toolCallDetail,
      toolResultText: input.toolResultText,
    });
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
      entryKind: "completed_tool_result",
      toolCallId: input.toolCallId,
      toolResultTextLength: input.toolResultText.length,
      conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
      modelContextItemCount: this.conversationHistory.listModelContextItems().length,
    });
  }

  appendFailedToolResultSessionEntry(input: FailedToolResultSessionEntryInput): void {
    this.conversationHistory.appendConversationSessionEntry({
      entryKind: "failed_tool_result",
      toolCallId: input.toolCallId,
      toolCallDetail: input.toolCallDetail,
      toolResultText: input.toolResultText,
      failureExplanation: input.failureExplanation,
    });
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
      entryKind: "failed_tool_result",
      toolCallId: input.toolCallId,
      toolResultTextLength: input.toolResultText.length,
      failureExplanation: input.failureExplanation,
      conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
      modelContextItemCount: this.conversationHistory.listModelContextItems().length,
    });
  }

  appendDeniedToolResultSessionEntry(input: DeniedToolResultSessionEntryInput): void {
    this.conversationHistory.appendConversationSessionEntry({
      entryKind: "denied_tool_result",
      toolCallId: input.toolCallId,
      toolCallDetail: input.toolCallDetail,
      toolResultText: input.toolResultText,
      denialExplanation: input.denialExplanation,
    });
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
      entryKind: "denied_tool_result",
      toolCallId: input.toolCallId,
      toolResultTextLength: input.toolResultText.length,
      conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
      modelContextItemCount: this.conversationHistory.listModelContextItems().length,
    });
  }
}
