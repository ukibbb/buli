import { expect, test } from "bun:test";
import {
  appendAssistantTextDeltaToStreamingProjectorState,
  createInitialAssistantStreamingProjectorState,
  finalizeAssistantStreamingProjectorState,
} from "../src/index.ts";

test("appendAssistantTextDeltaToStreamingProjectorState keeps an unfinished paragraph as the open streaming tail", () => {
  const projectorState = appendAssistantTextDeltaToStreamingProjectorState(
    createInitialAssistantStreamingProjectorState(),
    "Hello world",
  );

  expect(projectorState.projection).toEqual({
    fullResponseText: "Hello world",
    completedContentParts: [],
    openContentPart: {
      kind: "streaming_markdown_text",
      text: "Hello world",
    },
  });
});

test("appendAssistantTextDeltaToStreamingProjectorState finalizes completed blocks and keeps the remaining open tail", () => {
  let projectorState = appendAssistantTextDeltaToStreamingProjectorState(
    createInitialAssistantStreamingProjectorState(),
    "Hello world\n\n",
  );
  projectorState = appendAssistantTextDeltaToStreamingProjectorState(projectorState, "# Title\nAfter");

  expect(projectorState.projection).toEqual({
    fullResponseText: "Hello world\n\n# Title\nAfter",
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

test("appendAssistantTextDeltaToStreamingProjectorState keeps an open fenced code block without reparsing earlier content", () => {
  let projectorState = appendAssistantTextDeltaToStreamingProjectorState(
    createInitialAssistantStreamingProjectorState(),
    "Intro\n\n```ts\nconst answer = 42;\n",
  );
  projectorState = appendAssistantTextDeltaToStreamingProjectorState(projectorState, "console.log(answer);\n```\nTail");

  expect(projectorState.projection).toEqual({
    fullResponseText: "Intro\n\n```ts\nconst answer = 42;\nconsole.log(answer);\n```\nTail",
    completedContentParts: [
      {
        kind: "paragraph",
        inlineSpans: [{ spanKind: "plain", spanText: "Intro" }],
      },
      {
        kind: "fenced_code_block",
        languageLabel: "ts",
        codeLines: ["const answer = 42;", "console.log(answer);"],
      },
    ],
    openContentPart: {
      kind: "streaming_markdown_text",
      text: "Tail",
    },
  });
});

test("finalizeAssistantStreamingProjectorState turns the remaining open tail into final rich content parts", () => {
  const projectorState = appendAssistantTextDeltaToStreamingProjectorState(
    createInitialAssistantStreamingProjectorState(),
    "Hello **world**",
  );

  expect(finalizeAssistantStreamingProjectorState(projectorState)).toEqual({
    fullResponseText: "Hello **world**",
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
