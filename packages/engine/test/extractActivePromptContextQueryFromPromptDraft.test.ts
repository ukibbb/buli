import { expect, test } from "bun:test";
import { extractActivePromptContextQueryFromPromptDraft } from "../src/index.ts";

test("extractActivePromptContextQueryFromPromptDraft keeps bare @ as an empty query", () => {
  expect(extractActivePromptContextQueryFromPromptDraft("@", 1)).toEqual({
    rawQueryText: "",
    decodedQueryText: "",
    startOffset: 0,
    endOffset: 1,
  });
});

test("extractActivePromptContextQueryFromPromptDraft finds an unquoted query around the caret", () => {
  expect(extractActivePromptContextQueryFromPromptDraft("Inspect @apps/ later", 12)).toEqual({
    rawQueryText: "apps/",
    decodedQueryText: "apps/",
    startOffset: 8,
    endOffset: 14,
  });
});

test("extractActivePromptContextQueryFromPromptDraft supports an unfinished quoted query around the caret", () => {
  expect(extractActivePromptContextQueryFromPromptDraft('Inspect @"Desktop No next', 18)).toEqual({
    rawQueryText: '"Desktop No next',
    decodedQueryText: "Desktop No next",
    startOffset: 8,
    endOffset: 25,
  });
});

test("extractActivePromptContextQueryFromPromptDraft returns undefined when the caret has moved past query whitespace", () => {
  expect(extractActivePromptContextQueryFromPromptDraft("Inspect @apps/ later", 15)).toBeUndefined();
});
