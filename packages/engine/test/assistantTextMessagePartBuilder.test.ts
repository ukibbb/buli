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

test("assistant text builder keeps loose bulleted list items in one completed list block", () => {
  const builderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(
    createInitialAssistantTextMessagePartBuilder("assistant-text-1"),
    [
      "Examples:",
      "",
      "- injectable command handlers in `runCli`",
      "",
      "- separate executable wrapper in `bin/buli.js`",
      "",
      "- smoke tests covering dispatch",
    ].join("\n"),
  );

  expect(buildCompletedAssistantTextConversationMessagePart(builderState).completedContentParts).toEqual([
    {
      kind: "paragraph",
      inlineSpans: [{ spanKind: "plain", spanText: "Examples:" }],
    },
    {
      kind: "bulleted_list",
      itemSpanArrays: [
        [
          { spanKind: "plain", spanText: "injectable command handlers in " },
          { spanKind: "code", spanText: "runCli" },
        ],
        [
          { spanKind: "plain", spanText: "separate executable wrapper in " },
          { spanKind: "code", spanText: "bin/buli.js" },
        ],
        [{ spanKind: "plain", spanText: "smoke tests covering dispatch" }],
      ],
    },
  ]);
});

test("assistant text builder keeps loose numbered list items in one completed list block", () => {
  const builderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(
    createInitialAssistantTextMessagePartBuilder("assistant-text-1"),
    [
      "Steps:",
      "",
      "1. inspect the markdown renderer",
      "",
      "2. fix streamed loose list parsing",
      "",
      "3. verify the transcript output",
    ].join("\n"),
  );

  expect(buildCompletedAssistantTextConversationMessagePart(builderState).completedContentParts).toEqual([
    {
      kind: "paragraph",
      inlineSpans: [{ spanKind: "plain", spanText: "Steps:" }],
    },
    {
      kind: "numbered_list",
      itemSpanArrays: [
        [{ spanKind: "plain", spanText: "inspect the markdown renderer" }],
        [{ spanKind: "plain", spanText: "fix streamed loose list parsing" }],
        [{ spanKind: "plain", spanText: "verify the transcript output" }],
      ],
    },
  ]);
});

test("assistant text builder leaves a loose list tail open until the next nonblank line is known", () => {
  const builderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(
    createInitialAssistantTextMessagePartBuilder("assistant-text-1"),
    "- first item\n\n",
  );

  expect(buildStreamingAssistantTextConversationMessagePart(builderState)).toEqual({
    id: "assistant-text-1",
    partKind: "assistant_text",
    partStatus: "streaming",
    rawMarkdownText: "- first item\n\n",
    completedContentParts: [],
    openContentPart: {
      kind: "streaming_markdown_text",
      text: "- first item\n\n",
    },
  });
});
