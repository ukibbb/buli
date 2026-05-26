import type {
  AssistantOperatingMode,
  AssistantMessageConversationSessionEntry,
  AssistantSegmentConversationSessionEntry,
  BuliDiagnosticLogger,
  ProjectInstructionSnapshot,
  UserPromptImageAttachment,
  UserPromptSource,
} from "@buli/contracts";
import type { InMemoryConversationHistory } from "./conversationHistory.ts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";

export class RuntimeConversationTurnSessionRecorder {
  readonly conversationTurnId: string | undefined;
  readonly conversationHistory: InMemoryConversationHistory;
  readonly userPromptText: string;
  readonly assistantOperatingMode: AssistantOperatingMode;
  readonly promptSource: UserPromptSource | undefined;
  readonly userPromptImageAttachments: readonly UserPromptImageAttachment[];
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  private hasRecordedAcceptedUserPromptSessionEntry = false;
  private hasRecordedTerminalAssistantMessageSessionEntry = false;

  constructor(input: {
    conversationTurnId?: string | undefined;
    conversationHistory: InMemoryConversationHistory;
    userPromptText: string;
    assistantOperatingMode: AssistantOperatingMode;
    promptSource?: UserPromptSource | undefined;
    userPromptImageAttachments?: readonly UserPromptImageAttachment[];
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  }) {
    this.conversationTurnId = input.conversationTurnId;
    this.conversationHistory = input.conversationHistory;
    this.userPromptText = input.userPromptText;
    this.assistantOperatingMode = input.assistantOperatingMode;
    this.promptSource = input.promptSource;
    this.userPromptImageAttachments = input.userPromptImageAttachments ?? [];
    this.diagnosticLogger = input.diagnosticLogger;
  }

  hasAppendedAcceptedUserPromptSessionEntry(): boolean {
    return this.hasRecordedAcceptedUserPromptSessionEntry;
  }

  hasAppendedTerminalAssistantMessageSessionEntry(): boolean {
    return this.hasRecordedTerminalAssistantMessageSessionEntry;
  }

  appendAcceptedUserPromptSessionEntry(
    modelFacingPromptText: string,
    projectInstructionSnapshots?: readonly ProjectInstructionSnapshot[],
  ): void {
    if (this.hasRecordedAcceptedUserPromptSessionEntry) {
      return;
    }

    this.conversationHistory.appendConversationSessionEntry({
      entryKind: "user_prompt",
      promptText: this.userPromptText,
      modelFacingPromptText,
      ...(this.promptSource ? { promptSource: this.promptSource } : {}),
      assistantOperatingMode: this.assistantOperatingMode,
      ...(this.userPromptImageAttachments.length > 0 ? { imageAttachments: [...this.userPromptImageAttachments] } : {}),
      ...(projectInstructionSnapshots && projectInstructionSnapshots.length > 0
        ? { projectInstructionSnapshots: [...projectInstructionSnapshots] }
        : {}),
    });
    this.hasRecordedAcceptedUserPromptSessionEntry = true;
    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
      conversationTurnId: this.conversationTurnId ?? null,
      entryKind: "user_prompt",
      conversationSessionEntryCount: this.conversationHistory.countConversationSessionEntries(),
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
      conversationTurnId: this.conversationTurnId ?? null,
      entryKind: "assistant_message",
      assistantMessageStatus: assistantMessageConversationSessionEntry.assistantMessageStatus,
      assistantMessageTextLength: assistantMessageConversationSessionEntry.assistantMessageText.length,
      providerTurnReplayInputItemCount: assistantMessageConversationSessionEntry.providerTurnReplay?.inputItems.length ?? 0,
      conversationSessionEntryCount: this.conversationHistory.countConversationSessionEntries(),
    });
  }

  appendAssistantSegmentSessionEntry(
    assistantSegmentConversationSessionEntry: AssistantSegmentConversationSessionEntry,
  ): void {
    this.conversationHistory.appendConversationSessionEntry(assistantSegmentConversationSessionEntry);

    logEngineDiagnosticEvent(this.diagnosticLogger, "conversation_history.entry_appended", {
      conversationTurnId: this.conversationTurnId ?? null,
      entryKind: "assistant_text_segment",
      assistantTextSegmentTextLength: assistantSegmentConversationSessionEntry.assistantTextSegmentText.length,
      conversationSessionEntryCount: this.conversationHistory.countConversationSessionEntries(),
    });
  }
}
