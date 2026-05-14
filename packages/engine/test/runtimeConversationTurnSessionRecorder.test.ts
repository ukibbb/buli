import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent, ConversationSessionEntry } from "@buli/contracts";
import { InMemoryConversationHistory } from "../src/conversationHistory.ts";
import { RuntimeConversationTurnSessionRecorder } from "../src/runtimeConversationTurnSessionRecorder.ts";

test("RuntimeConversationTurnSessionRecorder records an accepted user prompt once", () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const conversationHistory = new InMemoryConversationHistory();
  const conversationTurnSessionRecorder = new RuntimeConversationTurnSessionRecorder({
    conversationHistory,
    userPromptText: "Use @notes.txt in the answer",
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
    },
  ]);
  expect(diagnosticEvents).toEqual<BuliDiagnosticLogEvent[]>([
    {
      subsystem: "engine",
      eventName: "conversation_history.entry_appended",
      fields: {
        entryKind: "user_prompt",
        conversationSessionEntryCount: 1,
        modelContextItemCount: 1,
      },
    },
  ]);
});

test("RuntimeConversationTurnSessionRecorder records a terminal assistant message once", () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const conversationHistory = new InMemoryConversationHistory();
  const conversationTurnSessionRecorder = new RuntimeConversationTurnSessionRecorder({
    conversationHistory,
    userPromptText: "Summarize the change",
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
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageTextLength: 17,
        providerTurnReplayInputItemCount: 1,
        conversationSessionEntryCount: 1,
        modelContextItemCount: 0,
      },
    },
  ]);
});
