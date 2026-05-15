import { expect, test } from "bun:test";
import {
  determinePromptContextQueryLoadStrategy,
  extractActivePromptContextQueryFromPromptDraft,
  reconcileSelectedPromptContextReferenceTextsWithPromptDraft,
  replaceActivePromptContextQueryWithSelectedReference,
} from "../src/index.ts";

test("extractActivePromptContextQueryFromPromptDraft returns the query under the cursor", () => {
  expect(extractActivePromptContextQueryFromPromptDraft("Read @packages/engine next", 12)).toEqual({
    rawQueryText: "packages/engine",
    decodedQueryText: "packages/engine",
    startOffset: 5,
    endOffset: 21,
  });
});

test("extractActivePromptContextQueryFromPromptDraft decodes quoted queries", () => {
  expect(extractActivePromptContextQueryFromPromptDraft('Open @"docs/My\\ File.md"', 12)).toEqual({
    rawQueryText: '"docs/My\\ File.md"',
    decodedQueryText: "docs/My File.md",
    startOffset: 5,
    endOffset: 24,
  });
});

test("replaceActivePromptContextQueryWithSelectedReference replaces only the active query", () => {
  const activePromptContextQuery = extractActivePromptContextQueryFromPromptDraft("Read @pack now", 9);
  if (!activePromptContextQuery) {
    throw new Error("expected active prompt context query");
  }

  expect(
    replaceActivePromptContextQueryWithSelectedReference({
      promptDraft: "Read @pack now",
      activePromptContextQuery,
      selectedPromptContextReferenceText: "@packages/engine",
    }),
  ).toBe("Read @packages/engine now");
});

test("reconcileSelectedPromptContextReferenceTextsWithPromptDraft preserves selected references still present in order", () => {
  expect(
    reconcileSelectedPromptContextReferenceTextsWithPromptDraft({
      promptDraft: "Read @README.md then @packages/engine",
      selectedPromptContextReferenceTexts: ["@README.md", "@missing.ts", "@packages/engine"],
    }),
  ).toEqual(["@README.md", "@packages/engine"]);
});

test("determinePromptContextQueryLoadStrategy classifies browse, path, and fuzzy queries", () => {
  expect(determinePromptContextQueryLoadStrategy("")).toBe("browse_current_directory");
  expect(determinePromptContextQueryLoadStrategy("packages/eng")).toBe("path_query");
  expect(determinePromptContextQueryLoadStrategy("runtime")).toBe("fuzzy_query");
});
