import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { WebSearchToolCallCard } from "../../../src/components/toolCalls/WebSearchToolCallCard.tsx";

describe("WebSearchToolCallCard", () => {
  test("streaming_shows_query_and_searching_status", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <WebSearchToolCallCard
        renderState="streaming"
        toolCallDetail={{
          toolName: "web_search",
          webSearchStatus: "searching",
          webSearchActionKind: "search",
          searchQueryTexts: ["latest OpenTUI release notes"],
        }}
      />,
      { width: 90, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("WebSearch");
    expect(frame).toContain("latest OpenTUI release notes");
    expect(frame).toContain("searching");
  });

  test("completed_shows_source_and_image_counts", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <WebSearchToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "web_search",
          webSearchStatus: "completed",
          webSearchActionKind: "search",
          searchQueryTexts: ["OpenTUI release notes", "OpenTUI docs"],
          sourceCount: 2,
          sources: [
            { sourceTitle: "OpenTUI releases", sourceUrl: "https://example.test/releases" },
            { sourceTitle: "OpenTUI docs", sourceUrl: "https://example.test/docs" },
          ],
          resultCount: 1,
          results: [
            {
              resultKind: "text",
              resultTitle: "OpenTUI release guide",
              resultUrl: "https://example.test/releases/guide",
              resultSnippet: "Release notes and migration details for OpenTUI.",
            },
          ],
          imageResultCount: 1,
        }}
      />,
      { width: 100, height: 14 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("WebSearch");
    expect(frame).toContain("OpenTUI release notes");
    expect(frame).toContain("done");
    expect(frame).toContain("2 sources");
    expect(frame).toContain("1 result");
    expect(frame).toContain("1 image");
    expect(frame).toContain("OpenTUI docs");
    expect(frame).toContain("https://example.test/releases");
    expect(frame).toContain("OpenTUI release guide");
    expect(frame).toContain("Release notes and migration details");
  });

  test("failed_shows_error_text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <WebSearchToolCallCard
        renderState="failed"
        toolCallDetail={{
          toolName: "web_search",
          webSearchStatus: "searching",
          webSearchActionKind: "search",
          searchQueryTexts: ["OpenTUI release notes"],
        }}
        errorText="web access failed"
      />,
      { width: 90, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("WebSearch");
    expect(frame).toContain("OpenTUI release notes");
    expect(frame).toContain("web access failed");
  });
});
