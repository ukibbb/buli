import { expect, test } from "bun:test";
import { parsePromptContextReferencesFromPromptText } from "../src/index.ts";

test("parsePromptContextReferencesFromPromptText parses unquoted and quoted prompt-context references", () => {
  expect(
    parsePromptContextReferencesFromPromptText('Summarize @Projects/buli/ and compare with @"Desktop Notes/todo list.txt".'),
  ).toEqual([
    {
      promptReferenceText: "@Projects/buli/",
      displayPath: "Projects/buli/",
      startOffset: 10,
      endOffset: 25,
    },
    {
      promptReferenceText: '@"Desktop Notes/todo list.txt"',
      displayPath: "Desktop Notes/todo list.txt",
      startOffset: 43,
      endOffset: 73,
    },
  ]);
});

test("parsePromptContextReferencesFromPromptText ignores email-style at signs and trims trailing punctuation", () => {
  expect(parsePromptContextReferencesFromPromptText("mail me at foo@example.com and inspect @docs/README.md,"))
    .toEqual([
      {
        promptReferenceText: "@docs/README.md",
        displayPath: "docs/README.md",
        startOffset: 39,
        endOffset: 54,
      },
    ]);
});
