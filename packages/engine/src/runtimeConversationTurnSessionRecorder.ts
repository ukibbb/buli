import type {
  AssistantMessageConversationSessionEntry,
  BuliDiagnosticLogger,
  UserPromptImageAttachment,
} from "@buli/contracts";
import type { InMemoryConversationHistory } from "./conversationHistory.ts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";

export class RuntimeConversationTurnSessionRecorder {
  readonly conversationHistory: InMemoryConversationHistory;
  readonly userPromptText: string;
  readonly userPromptImageAttachments: readonly UserPromptImageAttachment[];
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  private hasRecordedAcceptedUserPromptSessionEntry = false;
  private hasRecordedTerminalAssistantMessageSessionEntry = false;

  constructor(input: {
    conversationHistory: InMemoryConversationHistory;
    userPromptText: string;
    userPromptImageAttachments?: readonly UserPromptImageAttachment[];
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  }) {
    this.conversationHistory = input.conversationHistory;
    this.userPromptText = input.userPromptText;
    this.userPromptImageAttachments = input.userPromptImageAttachments ?? [];
    this.diagnosticLogger = input.diagnosticLogger;
  }

  hasAppendedAcceptedUserPromptSessionEntry(): boolean {
    return this.hasRecordedAcceptedUserPromptSessionEntry;
  }

  hasAppendedTerminalAssistantMessageSessionEntry(): boolean {
    return this.hasRecordedTerminalAssistantMessageSessionEntry;
  }

  appendAcceptedUserPromptSessionEntry(modelFacingPromptText: string): void {
    if (this.hasRecordedAcceptedUserPromptSessionEntry) {
      return;
    }

    this.conversationHistory.appendConversationSessionEntry({
      entryKind: "user_prompt",
      promptText: this.userPromptText,
      modelFacingPromptText,
      ...(this.userPromptImageAttachments.length > 0 ? { imageAttachments: [...this.userPromptImageAttachments] } : {}),
    });
    this.hasRecordedAcceptedUserPromptSessionEntry = true;
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
      entryKind: "user_prompt",
      conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
      modelContextItemCount: this.conversationHistory.listModelContextItems().length,
    });
  }

  appendTerminalAssistantMessageSessionEntry(
    assistantMessageConversationSessionEntry: AssistantMessageConversationSessionEntry,
  ): void {
    if (this.hasRecordedTerminalAssistantMessageSessionEntry) {
      return;
    }

    this.conversationHistory.appendConversationSessionEntry(assistantMessageConversationSessionEntry);
    this.hasRecordedTerminalAssistantMessageSessionEntry = true;
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
      entryKind: "assistant_message",
      assistantMessageStatus: assistantMessageConversationSessionEntry.assistantMessageStatus,
      assistantMessageTextLength: assistantMessageConversationSessionEntry.assistantMessageText.length,
      providerTurnReplayInputItemCount: assistantMessageConversationSessionEntry.providerTurnReplay?.inputItems.length ?? 0,
      conversationSessionEntryCount: this.conversationHistory.listConversationSessionEntries().length,
      modelContextItemCount: this.conversationHistory.listModelContextItems().length,
    });
  }
}
