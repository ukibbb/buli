import { describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { SearchManyToolCallCard } from "../../../src/components/toolCalls/SearchManyToolCallCard.tsx";

describe("SearchManyToolCallCard", () => {
  test("completed_starts_collapsed_with_SearchMany_label_and_batch_summary", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <SearchManyToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "search_many",
          requestedSearches: [
            { searchKind: "glob", globPattern: "src/**/*.ts" },
            { searchKind: "grep", regexPattern: "SearchMany" },
          ],
          completedSearchCount: 1,
          failedSearchCount: 1,
          searchResults: [
            {
              searchStatus: "completed",
              searchDetail: {
                toolName: "glob",
                globPattern: "src/**/*.ts",
                matchedPathCount: 1,
                returnedPathCount: 1,
                matchedPaths: ["src/app.ts"],
              },
            },
            {
              searchStatus: "failed",
              searchDetail: { toolName: "grep", searchPattern: "[" },
              failureExplanation: "Invalid regular expression",
            },
          ],
        }}
      />,
      { width: 100, height: 18 },
    );
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("SearchMany");
    expect(frame).toContain("[2 searches]");
    expect(frame).toContain("1/2 searched, 1 failed");
    expect(frame).not.toContain("src/app.ts");
    expect(frame).not.toContain("Invalid regular expression");
  });

  test("completed_expands_child_results_with_separator", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <SearchManyToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "search_many",
          requestedSearches: [
            { searchKind: "glob", globPattern: "src/**/*.ts" },
            { searchKind: "grep", regexPattern: "SearchMany" },
          ],
          completedSearchCount: 2,
          failedSearchCount: 0,
          searchResults: [
            {
              searchStatus: "completed",
              searchDetail: {
                toolName: "glob",
                globPattern: "src/**/*.ts",
                matchedPathCount: 1,
                returnedPathCount: 1,
                matchedPaths: ["src/app.ts"],
              },
            },
            {
              searchStatus: "completed",
              searchDetail: {
                toolName: "grep",
                searchPattern: "SearchMany",
                totalMatchCount: 1,
                returnedMatchHitCount: 1,
                matchedFileCount: 1,
                matchHits: [
                  {
                    matchFilePath: "src/app.ts",
                    matchLineNumber: 7,
                    matchSnippet: "const label = 'SearchMany';",
                    contextBeforeLines: [{ lineNumber: 6, lineText: "function label() {" }],
                    contextAfterLines: [{ lineNumber: 8, lineText: "}" }],
                  },
                ],
              },
            },
          ],
        }}
      />,
      { width: 100, height: 28 },
    );
    await renderOnce();

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("[-]");
    expect(frame).toContain("Glob [src/**/*.ts]");
    expect(frame).toContain("src/app.ts");
    expect(frame).toContain("Grep [SearchMany]");
    expect(frame).toContain("src/app.ts:6-8");
    expect(frame).toContain("function label()");
    expect(frame).toContain("const label = 'SearchMany';");
    expect(frame).toContain("─");
    expect(frame).not.toContain("1. glob");
    expect(frame).not.toContain("2. grep");
    expect(frame).not.toContain("- completed");
    expect(frame).not.toContain("6 function label()");
  });

  test("completed_limits_expanded_glob_paths_and_grep_matches", async () => {
    const matchedPaths = Array.from({ length: 30 }, (_value, index) => `src/file-${index + 1}.ts`);
    const matchHits = Array.from({ length: 30 }, (_value, index) => ({
      matchFilePath: "src/app.ts",
      matchLineNumber: index + 1,
      matchSnippet: `match ${index + 1}`,
    }));
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <SearchManyToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "search_many",
          requestedSearches: [
            { searchKind: "glob", globPattern: "src/**/*.ts" },
            { searchKind: "grep", regexPattern: "match" },
          ],
          completedSearchCount: 2,
          failedSearchCount: 0,
          searchResults: [
            {
              searchStatus: "completed",
              searchDetail: {
                toolName: "glob",
                globPattern: "src/**/*.ts",
                matchedPathCount: 30,
                returnedPathCount: 30,
                matchedPaths,
              },
            },
            {
              searchStatus: "completed",
              searchDetail: {
                toolName: "grep",
                searchPattern: "match",
                totalMatchCount: 30,
                returnedMatchHitCount: 30,
                matchedFileCount: 1,
                matchHits,
              },
            },
          ],
        }}
      />,
      { width: 100, height: 80 },
    );
    await renderOnce();

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("showing first 25 of 30 paths");
    expect(frame).toContain("showing first 25 of 30 matches");
    expect(frame).toContain("src/file-25.ts");
    expect(frame).not.toContain("src/file-26.ts");
    expect(frame).toContain("match 25");
    expect(frame).not.toContain("match 26");
  });

  test("streaming_shows_search_count", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <SearchManyToolCallCard
        renderState="streaming"
        toolCallDetail={{
          toolName: "search_many",
          requestedSearches: [
            { searchKind: "glob", globPattern: "**/*.ts" },
            { searchKind: "grep", regexPattern: "ToolCallRequest" },
            { searchKind: "grep", regexPattern: "SearchMany", includeGlobPattern: "*.tsx" },
          ],
        }}
      />,
      { width: 90, height: 10 },
    );
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("SearchMany");
    expect(frame).toContain("[3 searches]");
    expect(frame).toContain("searching 3 searches");
  });
});
