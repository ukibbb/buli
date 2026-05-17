import { expect, test } from "bun:test";
import {
  appendAssistantTextDeltaToAssistantTextMessagePartBuilder,
  buildCompletedAssistantTextConversationMessagePart,
  buildStreamingAssistantTextConversationMessagePart,
  createInitialAssistantTextMessagePartBuilder,
} from "../src/assistantTextMessagePartBuilder.ts";

test("assistant text builder keeps unfinished markdown as raw streaming text", () => {
  const builderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(
    createInitialAssistantTextMessagePartBuilder("assistant-text-1"),
    "Hello **world**",
  );

  expect(buildStreamingAssistantTextConversationMessagePart(builderState)).toEqual({
    id: "assistant-text-1",
    partKind: "assistant_text",
    partStatus: "streaming",
    rawMarkdownText: "Hello **world**",
  });
});

test("assistant text builder normalizes CRLF and CR deltas before appending", () => {
  let builderState = createInitialAssistantTextMessagePartBuilder("assistant-text-1");
  builderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(builderState, "first\r\nsecond");
  builderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(builderState, "\rthird");

  expect(buildStreamingAssistantTextConversationMessagePart(builderState).rawMarkdownText).toBe("first\nsecond\nthird");
});

test("assistant text builder emits a completed assistant text part on finalize", () => {
  const builderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(
    createInitialAssistantTextMessagePartBuilder("assistant-text-1"),
    "# Title\n\n- first\n- second",
  );

  expect(buildCompletedAssistantTextConversationMessagePart(builderState)).toEqual({
    id: "assistant-text-1",
    partKind: "assistant_text",
    partStatus: "completed",
    rawMarkdownText: "# Title\n\n- first\n- second",
  });
});

test("assistant text builder preserves exact text across many small deltas", () => {
  let builderState = createInitialAssistantTextMessagePartBuilder("assistant-text-1");
  const assistantTextDeltas = Array.from({ length: 2_000 }, (_, deltaIndex) => `${deltaIndex % 10}`);
  for (const assistantTextDelta of assistantTextDeltas) {
    builderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(builderState, assistantTextDelta);
  }

  expect(buildCompletedAssistantTextConversationMessagePart(builderState).rawMarkdownText).toBe(
    assistantTextDeltas.join(""),
  );
});
