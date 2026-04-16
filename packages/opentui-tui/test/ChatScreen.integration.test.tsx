import { expect, test } from "bun:test";
import type { AssistantResponseEvent } from "@buli/contracts";
import {
  appendTypedTextToPromptDraft,
  applyAssistantResponseEventToChatScreenState,
  createInitialChatScreenState,
  submitPromptDraft,
} from "../src/index.ts";

// This test exercises the chat-screen state reducer end-to-end through a full
// streaming turn. It does not render any UI — the OpenTUI test harness
// (testRender / captureCharFrame) is not used here because the integration
// concern is the reducer fold, not the visual output. Component render tests
// live in test/components/.
//
// The ink-tui counterpart used ink-testing-library render + lastFrame(); those
// helpers have no opentui equivalent so we assert on state shape directly.
test("applyAssistantResponseEventToChatScreenState renders a full turn through streaming reasoning into a collapsed chip", () => {
  let chatScreenState = appendTypedTextToPromptDraft(
    createInitialChatScreenState({ selectedModelId: "gpt-5.4" }),
    "why",
  );
  chatScreenState = submitPromptDraft(chatScreenState).nextChatScreenState;

  const turnEvents: AssistantResponseEvent[] = [
    { type: "assistant_response_started", model: "gpt-5.4" },
    { type: "assistant_reasoning_summary_started" },
    { type: "assistant_reasoning_summary_text_chunk", text: "Thinking\u2026" },
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
  expect(collapsedEntry.reasoningSummaryText).toBe("Thinking\u2026");
  expect(collapsedEntry.reasoningDurationMs).toBe(1500);
  expect(collapsedEntry.reasoningTokenCount).toBe(2);
});
