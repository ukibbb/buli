import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent, ConversationSessionEntry } from "@buli/contracts";
import { InMemoryConversationHistory } from "../src/conversationHistory.ts";
import { RuntimeConversationTurnSessionRecorder } from "../src/runtimeConversationTurnSessionRecorder.ts";

test("RuntimeConversationTurnSessionRecorder records an accepted user prompt once", () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const imageAttachment = {
    attachmentId: "image-1",
    mimeType: "image/png" as const,
    dataUrl: "data:image/png;base64,aGVsbG8=",
  };
  const conversationHistory = new InMemoryConversationHistory();
  const conversationTurnSessionRecorder = new RuntimeConversationTurnSessionRecorder({
    conversationTurnId: "conversation-turn-1",
    conversationHistory,
    userPromptText: "Use @notes.txt in the answer",
    assistantOperatingMode: "understand",
    userPromptImageAttachments: [imageAttachment],
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  conversationTurnSessionRecorder.appendAcceptedUserPromptSessionEntry("Expanded prompt with notes");
  conversationTurnSessionRecorder.appendAcceptedUserPromptSessionEntry("Ignored second prompt");

  expect(conversationTurnSessionRecorder.hasAppendedAcceptedUserPromptSessionEntry()).toBe(true);
  expect(conversationHistory.listConversationSessionEntries()).toEqual<ConversationSessionEntry[]>([
    {
      entryKind: "user_prompt",
      promptText: "Use @notes.txt in the answer",
      modelFacingPromptText: "Expanded prompt with notes",
      assistantOperatingMode: "understand",
      imageAttachments: [imageAttachment],
    },
  ]);
  expect(diagnosticEvents).toEqual<BuliDiagnosticLogEvent[]>([
    {
      subsystem: "engine",
      eventName: "conversation_history.entry_appended",
      fields: {
        conversationTurnId: "conversation-turn-1",
        entryKind: "user_prompt",
        conversationSessionEntryCount: 1,
      },
    },
  ]);
});

test("RuntimeConversationTurnSessionRecorder records a terminal assistant message once", () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const conversationHistory = new InMemoryConversationHistory();
  const conversationTurnSessionRecorder = new RuntimeConversationTurnSessionRecorder({
    conversationTurnId: "conversation-turn-1",
    conversationHistory,
    userPromptText: "Summarize the change",
    assistantOperatingMode: "understand",
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  conversationTurnSessionRecorder.appendTerminalAssistantMessageSessionEntry({
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Summary complete.",
    providerTurnReplay: {
      provider: "openai",
      inputItems: [
        {
          type: "function_call_output",
          call_id: "call_1",
          output: "tool result",
        },
      ],
    },
  });
  conversationTurnSessionRecorder.appendTerminalAssistantMessageSessionEntry({
    entryKind: "assistant_message",
    assistantMessageStatus: "failed",
    assistantMessageText: "Ignored failure.",
    failureExplanation: "ignored",
  });

  expect(conversationTurnSessionRecorder.hasAppendedTerminalAssistantMessageSessionEntry()).toBe(true);
  expect(conversationHistory.listConversationSessionEntries()).toEqual<ConversationSessionEntry[]>([
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Summary complete.",
      assistantOperatingMode: "understand",
      providerTurnReplay: {
        provider: "openai",
        inputItems: [
          {
            type: "function_call_output",
            call_id: "call_1",
            output: "tool result",
          },
        ],
      },
    },
  ]);
  expect(diagnosticEvents).toEqual<BuliDiagnosticLogEvent[]>([
    {
      subsystem: "engine",
      eventName: "conversation_history.entry_appended",
      fields: {
        conversationTurnId: "conversation-turn-1",
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageTextLength: 17,
        providerTurnReplayInputItemCount: 1,
        conversationSessionEntryCount: 1,
      },
    },
  ]);
});

test("RuntimeConversationTurnSessionRecorder preserves an explicit terminal assistant operating mode", () => {
  const conversationHistory = new InMemoryConversationHistory();
  const conversationTurnSessionRecorder = new RuntimeConversationTurnSessionRecorder({
    conversationHistory,
    userPromptText: "Execute the plan",
    assistantOperatingMode: "implementation",
  });

  conversationTurnSessionRecorder.appendTerminalAssistantMessageSessionEntry({
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Plan recorded.",
    assistantOperatingMode: "plan",
  });

  expect(conversationHistory.listConversationSessionEntries()).toEqual<ConversationSessionEntry[]>([
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Plan recorded.",
      assistantOperatingMode: "plan",
    },
  ]);
});

test("RuntimeConversationTurnSessionRecorder records BuliStickyNotes context once", () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const conversationHistory = new InMemoryConversationHistory();
  const conversationTurnSessionRecorder = new RuntimeConversationTurnSessionRecorder({
    conversationTurnId: "conversation-turn-1",
    conversationHistory,
    userPromptText: "Continue",
    assistantOperatingMode: "implementation",
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });
  const buliStickyNotesContextText = [
    "BuliStickyNotes:",
    "Purpose-aware evidence notes from prior turns:",
    "Use these as source pointers, not active memory.",
  ].join("\n");

  conversationTurnSessionRecorder.appendBuliStickyNotesSessionEntry(buliStickyNotesContextText);
  conversationTurnSessionRecorder.appendBuliStickyNotesSessionEntry("Ignored duplicate sticky notes.");

  expect(conversationTurnSessionRecorder.hasAppendedBuliStickyNotesSessionEntry()).toBe(true);
  expect(conversationHistory.listConversationSessionEntries()).toEqual<ConversationSessionEntry[]>([
    {
      entryKind: "buli_sticky_notes",
      buliStickyNotesContextText,
    },
  ]);
  expect(diagnosticEvents).toEqual<BuliDiagnosticLogEvent[]>([
    {
      subsystem: "engine",
      eventName: "conversation_history.entry_appended",
      fields: {
        conversationTurnId: "conversation-turn-1",
        entryKind: "buli_sticky_notes",
        buliStickyNotesContextTextLength: buliStickyNotesContextText.length,
        conversationSessionEntryCount: 1,
      },
    },
  ]);
});
