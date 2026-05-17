import { expect, test } from "bun:test";
import {
  determinePromptContextQueryLoadStrategy,
  extractActivePromptContextQueryFromPromptDraft,
  normalizePromptContextQueryText,
  parsePromptContextPathQuery,
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

test("extractActivePromptContextQueryFromPromptDraft treats trailing sentence punctuation as outside an unquoted query", () => {
  expect(extractActivePromptContextQueryFromPromptDraft("Compare @docs/README.md, next", 16)).toEqual({
    rawQueryText: "docs/README.md",
    decodedQueryText: "docs/README.md",
    startOffset: 8,
    endOffset: 23,
  });
  expect(extractActivePromptContextQueryFromPromptDraft("Compare @docs/README.md, next", 24)).toBeUndefined();
});

test("extractActivePromptContextQueryFromPromptDraft keeps current-directory path queries", () => {
  expect(extractActivePromptContextQueryFromPromptDraft("@.", 2)).toEqual({
    rawQueryText: ".",
    decodedQueryText: ".",
    startOffset: 0,
    endOffset: 2,
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

test("reconcileSelectedPromptContextReferenceTextsWithPromptDraft matches references instead of substrings", () => {
  expect(
    reconcileSelectedPromptContextReferenceTextsWithPromptDraft({
      promptDraft: "Read @README.md.backup",
      selectedPromptContextReferenceTexts: ["@README.md"],
    }),
  ).toEqual([]);
});

test("reconcileSelectedPromptContextReferenceTextsWithPromptDraft preserves references before trailing punctuation", () => {
  expect(
    reconcileSelectedPromptContextReferenceTextsWithPromptDraft({
      promptDraft: "Read @README.md, then continue",
      selectedPromptContextReferenceTexts: ["", "@README.md"],
    }),
  ).toEqual(["@README.md"]);
});

test("determinePromptContextQueryLoadStrategy classifies browse, path, and fuzzy queries", () => {
  expect(determinePromptContextQueryLoadStrategy("")).toBe("browse_current_directory");
  expect(determinePromptContextQueryLoadStrategy("packages/eng")).toBe("path_query");
  expect(determinePromptContextQueryLoadStrategy("runtime")).toBe("fuzzy_query");
});

test("normalizePromptContextQueryText removes leading quote and escaped query characters", () => {
  expect(normalizePromptContextQueryText('"docs/My\\ File.md')).toBe("docs/My File.md");
  expect(normalizePromptContextQueryText("src/\\\"quoted\\\"")).toBe('src/"quoted"');
});

test("parsePromptContextPathQuery returns the directory query and entry name query", () => {
  expect(parsePromptContextPathQuery("~")).toEqual({ queryDirectoryPathText: "~/", entryNameQuery: "" });
  expect(parsePromptContextPathQuery("~desk")).toEqual({ queryDirectoryPathText: "~/", entryNameQuery: "desk" });
  expect(parsePromptContextPathQuery("../shared/notes")).toEqual({
    queryDirectoryPathText: "../shared/",
    entryNameQuery: "notes",
  });
  expect(parsePromptContextPathQuery("runtime")).toBeUndefined();
});
