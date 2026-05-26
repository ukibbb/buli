import type { BuliDiagnosticLogger, ToolCallDetail, WorkspacePatch } from "@buli/contracts";
import type { InMemoryConversationHistory } from "./conversationHistory.ts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";

type ToolResultConversationSessionEntry = Extract<
  InMemoryConversationHistory["conversationSessionEntries"][number],
  { entryKind: "completed_tool_result" | "failed_tool_result" | "denied_tool_result" }
>;

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

type WorkspacePatchSessionEntryInput = {
  workspacePatch: WorkspacePatch;
};

export class RuntimeToolResultSessionRecorder {
  readonly conversationTurnId: string | undefined;
  readonly conversationHistory: InMemoryConversationHistory;
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;

  constructor(input: {
    conversationTurnId?: string | undefined;
    conversationHistory: InMemoryConversationHistory;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  }) {
    this.conversationTurnId = input.conversationTurnId;
    this.conversationHistory = input.conversationHistory;
    this.diagnosticLogger = input.diagnosticLogger;
  }

  appendCompletedToolResultSessionEntry(input: CompletedToolResultSessionEntryInput): void {
    const duplicateToolResultDiagnosticFields = this.createDuplicateToolResultDiagnosticFields({
      toolCallDetail: input.toolCallDetail,
      toolResultText: input.toolResultText,
    });
    this.conversationHistory.appendConversationSessionEntry({
      entryKind: "completed_tool_result",
      toolCallId: input.toolCallId,
      toolCallDetail: input.toolCallDetail,
      toolResultText: input.toolResultText,
    });
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
      conversationTurnId: this.conversationTurnId ?? null,
      entryKind: "completed_tool_result",
      toolCallId: input.toolCallId,
      toolName: input.toolCallDetail.toolName,
      toolResultTextLength: input.toolResultText.length,
      ...duplicateToolResultDiagnosticFields,
      conversationSessionEntryCount: this.conversationHistory.countConversationSessionEntries(),
    });
  }

  appendFailedToolResultSessionEntry(input: FailedToolResultSessionEntryInput): void {
    const duplicateToolResultDiagnosticFields = this.createDuplicateToolResultDiagnosticFields({
      toolCallDetail: input.toolCallDetail,
      toolResultText: input.toolResultText,
    });
    this.conversationHistory.appendConversationSessionEntry({
      entryKind: "failed_tool_result",
      toolCallId: input.toolCallId,
      toolCallDetail: input.toolCallDetail,
      toolResultText: input.toolResultText,
      failureExplanation: input.failureExplanation,
    });
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
      conversationTurnId: this.conversationTurnId ?? null,
      entryKind: "failed_tool_result",
      toolCallId: input.toolCallId,
      toolName: input.toolCallDetail.toolName,
      toolResultTextLength: input.toolResultText.length,
      ...duplicateToolResultDiagnosticFields,
      failureExplanation: input.failureExplanation,
      conversationSessionEntryCount: this.conversationHistory.countConversationSessionEntries(),
    });
  }

  appendDeniedToolResultSessionEntry(input: DeniedToolResultSessionEntryInput): void {
    const duplicateToolResultDiagnosticFields = this.createDuplicateToolResultDiagnosticFields({
      toolCallDetail: input.toolCallDetail,
      toolResultText: input.toolResultText,
    });
    this.conversationHistory.appendConversationSessionEntry({
      entryKind: "denied_tool_result",
      toolCallId: input.toolCallId,
      toolCallDetail: input.toolCallDetail,
      toolResultText: input.toolResultText,
      denialExplanation: input.denialExplanation,
    });
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
      conversationTurnId: this.conversationTurnId ?? null,
      entryKind: "denied_tool_result",
      toolCallId: input.toolCallId,
      toolName: input.toolCallDetail.toolName,
      toolResultTextLength: input.toolResultText.length,
      ...duplicateToolResultDiagnosticFields,
      conversationSessionEntryCount: this.conversationHistory.countConversationSessionEntries(),
    });
  }

  appendWorkspacePatchSessionEntry(input: WorkspacePatchSessionEntryInput): void {
    this.conversationHistory.appendConversationSessionEntry({
      entryKind: "workspace_patch",
      workspacePatch: input.workspacePatch,
    });
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
      conversationTurnId: this.conversationTurnId ?? null,
      entryKind: "workspace_patch",
      toolCallId: input.workspacePatch.toolCallId,
      workspacePatchId: input.workspacePatch.workspacePatchId,
      changedFileCount: input.workspacePatch.changedFileCount,
      conversationSessionEntryCount: this.conversationHistory.countConversationSessionEntries(),
    });
  }

  private createDuplicateToolResultDiagnosticFields(input: {
    toolCallDetail: ToolCallDetail;
    toolResultText: string;
  }): Record<string, string | number> {
    if (!this.diagnosticLogger) {
      return {};
    }

    let duplicateToolResultTextPreviousCount = 0;
    let duplicateToolResultTextSameToolNamePreviousCount = 0;
    let firstDuplicateToolResultEntry: ToolResultConversationSessionEntry | undefined;
    for (const conversationSessionEntry of this.conversationHistory.conversationSessionEntries) {
      if (
        !isToolResultConversationSessionEntry(conversationSessionEntry) ||
        conversationSessionEntry.toolResultText !== input.toolResultText
      ) {
        continue;
      }

      duplicateToolResultTextPreviousCount += 1;
      if (conversationSessionEntry.toolCallDetail.toolName === input.toolCallDetail.toolName) {
        duplicateToolResultTextSameToolNamePreviousCount += 1;
      }
      firstDuplicateToolResultEntry ??= conversationSessionEntry;
    }

    if (!firstDuplicateToolResultEntry) {
      return {};
    }

    return {
      duplicateToolResultTextPreviousCount,
      duplicateToolResultTextSameToolNamePreviousCount,
      duplicateToolResultFirstToolCallId: firstDuplicateToolResultEntry.toolCallId,
      duplicateToolResultFirstToolName: firstDuplicateToolResultEntry.toolCallDetail.toolName,
    };
  }
}

function isToolResultConversationSessionEntry(
  conversationSessionEntry: InMemoryConversationHistory["conversationSessionEntries"][number],
): conversationSessionEntry is ToolResultConversationSessionEntry {
  return conversationSessionEntry.entryKind === "completed_tool_result" ||
    conversationSessionEntry.entryKind === "failed_tool_result" ||
    conversationSessionEntry.entryKind === "denied_tool_result";
}
