import { expect, test } from "bun:test";
import {
  extractActivePromptContextQueryFromPromptDraft,
  replaceActivePromptContextQueryWithSelectedReference,
} from "../src/index.ts";

test("replaceActivePromptContextQueryWithSelectedReference replaces an unquoted query in the middle of the draft", () => {
  const activePromptContextQuery = extractActivePromptContextQueryFromPromptDraft("Inspect @Proj/bu later", 14);
  if (!activePromptContextQuery) {
    throw new Error("expected an active prompt-context query");
  }

  expect(
    replaceActivePromptContextQueryWithSelectedReference({
      promptDraft: "Inspect @Proj/bu later",
      activePromptContextQuery,
      selectedPromptContextReferenceText: "@Projects/buli/",
    }),
  ).toBe("Inspect @Projects/buli/ later");
});

test("replaceActivePromptContextQueryWithSelectedReference replaces a quoted query in the middle of the draft", () => {
  const promptDraft = 'Inspect @"Desktop No later';
  const activePromptContextQuery = extractActivePromptContextQueryFromPromptDraft(promptDraft, 18);
  if (!activePromptContextQuery) {
    throw new Error("expected an active prompt-context query");
  }

  expect(
    replaceActivePromptContextQueryWithSelectedReference({
      promptDraft,
      activePromptContextQuery,
      selectedPromptContextReferenceText: '@"Desktop Notes/todo list.txt"',
    }),
  ).toBe('Inspect @"Desktop Notes/todo list.txt"');
});
