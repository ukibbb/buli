import { expect, test } from "bun:test";
import { buildPromptContextDisplaySegments } from "../src/index.ts";

test("buildPromptContextDisplaySegments splits the draft into plain text and selected prompt-context references", () => {
  expect(
    buildPromptContextDisplaySegments({
      promptDraft: 'Inspect @notes.txt and @"Desktop Notes/todo list.txt" next',
      selectedPromptContextReferenceTexts: ["@notes.txt", '@"Desktop Notes/todo list.txt"'],
    }),
  ).toEqual([
    { segmentKind: "plain_text", text: "Inspect " },
    { segmentKind: "selected_prompt_context_reference", text: "@notes.txt" },
    { segmentKind: "plain_text", text: " and " },
    { segmentKind: "selected_prompt_context_reference", text: '@"Desktop Notes/todo list.txt"' },
    { segmentKind: "plain_text", text: " next" },
  ]);
});
