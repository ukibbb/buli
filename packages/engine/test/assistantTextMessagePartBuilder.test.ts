import { expect, test } from "bun:test";
import {
  appendAssistantTextDeltaToAssistantTextMessagePartBuilder,
  buildCompletedAssistantTextConversationMessagePart,
  buildStreamingAssistantTextConversationMessagePart,
  createInitialAssistantTextMessagePartBuilder,
} from "../src/assistantTextMessagePartBuilder.ts";

test("assistant text builder keeps unfinished markdown as an open streaming tail", () => {
  const builderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(
    createInitialAssistantTextMessagePartBuilder("assistant-text-1"),
    "Hello world",
  );

  expect(buildStreamingAssistantTextConversationMessagePart(builderState)).toEqual({
    id: "assistant-text-1",
    partKind: "assistant_text",
    partStatus: "streaming",
    rawMarkdownText: "Hello world",
    completedContentParts: [],
    openContentPart: {
      kind: "streaming_markdown_text",
      text: "Hello world",
    },
  });
});

test("assistant text builder finalizes completed blocks without reparsing earlier content", () => {
  let builderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(
    createInitialAssistantTextMessagePartBuilder("assistant-text-1"),
    "Hello world\n\n",
  );
  builderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(builderState, "# Title\nAfter");

  expect(buildStreamingAssistantTextConversationMessagePart(builderState)).toEqual({
    id: "assistant-text-1",
    partKind: "assistant_text",
    partStatus: "streaming",
    rawMarkdownText: "Hello world\n\n# Title\nAfter",
    completedContentParts: [
      {
        kind: "paragraph",
        inlineSpans: [{ spanKind: "plain", spanText: "Hello world" }],
      },
      {
        kind: "heading",
        headingLevel: 1,
        inlineSpans: [{ spanKind: "plain", spanText: "Title" }],
      },
    ],
    openContentPart: {
      kind: "streaming_markdown_text",
      text: "After",
    },
  });
});

test("assistant text builder emits a completed assistant text part on finalize", () => {
  const builderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(
    createInitialAssistantTextMessagePartBuilder("assistant-text-1"),
    "Hello **world**",
  );

  expect(buildCompletedAssistantTextConversationMessagePart(builderState)).toEqual({
    id: "assistant-text-1",
    partKind: "assistant_text",
    partStatus: "completed",
    rawMarkdownText: "Hello **world**",
    completedContentParts: [
      {
        kind: "paragraph",
        inlineSpans: [
          { spanKind: "plain", spanText: "Hello " },
          { spanKind: "bold", spanText: "world" },
        ],
      },
    ],
  });
});
