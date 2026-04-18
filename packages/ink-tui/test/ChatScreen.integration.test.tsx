import { expect, test } from "bun:test";
import type { AssistantResponseEvent } from "@buli/contracts";
import {
  applyAssistantResponseEventToChatScreenState,
  createInitialChatScreenState,
  insertTextIntoPromptDraftAtCursor,
  submitPromptDraft,
} from "../src/index.ts";

test("applyAssistantResponseEventToChatScreenState renders a full turn through streaming reasoning into a collapsed chip", () => {
  let chatScreenState = insertTextIntoPromptDraftAtCursor(
    createInitialChatScreenState({ selectedModelId: "gpt-5.4" }),
    "why",
  );
  chatScreenState = submitPromptDraft(chatScreenState).nextChatScreenState;

  const turnEvents: AssistantResponseEvent[] = [
    { type: "assistant_response_started", model: "gpt-5.4" },
    { type: "assistant_reasoning_summary_started" },
    { type: "assistant_reasoning_summary_text_chunk", text: "Thinking…" },
    { type: "assistant_reasoning_summary_completed", reasoningDurationMs: 1500 },
    { type: "assistant_response_text_chunk", text: "Because." },
    {
      type: "assistant_response_completed",
      message: { id: "msg_42", role: "assistant", text: "Because." },
      usage: { total: 10, input: 5, output: 3, reasoning: 2, cache: { read: 0, write: 0 } },
    },
  ];

  for (const event of turnEvents) {
    chatScreenState = applyAssistantResponseEventToChatScreenState(chatScreenState, event);
  }

  const kinds = chatScreenState.conversationTranscript.map((entry) => entry.kind);
  expect(kinds).toEqual([
    "message",
    "completed_reasoning_summary",
    "message",
  ]);

  const collapsedEntry = chatScreenState.conversationTranscript.find(
    (entry) => entry.kind === "completed_reasoning_summary",
  );
  if (collapsedEntry?.kind !== "completed_reasoning_summary") {
    throw new Error("expected collapsed reasoning summary");
  }
  expect(collapsedEntry.reasoningSummaryText).toBe("Thinking…");
  expect(collapsedEntry.reasoningDurationMs).toBe(1500);
  expect(collapsedEntry.reasoningTokenCount).toBe(2);
});
