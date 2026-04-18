import { expect, test } from "bun:test";
import { replaceTrailingPromptContextQueryWithSelectedReference } from "../src/index.ts";

test("replaceTrailingPromptContextQueryWithSelectedReference replaces an unquoted trailing query", () => {
  expect(
    replaceTrailingPromptContextQueryWithSelectedReference({
      promptDraft: "Inspect @Proj/bu",
      selectedPromptContextReferenceText: "@Projects/buli/",
    }),
  ).toBe("Inspect @Projects/buli/");
});

test("replaceTrailingPromptContextQueryWithSelectedReference replaces a quoted trailing query", () => {
  expect(
    replaceTrailingPromptContextQueryWithSelectedReference({
      promptDraft: 'Inspect @"Desktop No',
      selectedPromptContextReferenceText: '@"Desktop Notes/todo list.txt"',
    }),
  ).toBe('Inspect @"Desktop Notes/todo list.txt"');
});
