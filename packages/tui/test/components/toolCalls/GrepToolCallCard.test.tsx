import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { GrepToolCallCard } from "../../../src/components/toolCalls/GrepToolCallCard.tsx";

describe("GrepToolCallCard", () => {
  test("streaming_shows_bracketed_pattern", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <GrepToolCallCard
        renderState="streaming"
        toolCallDetail={{
          toolName: "grep",
          searchPattern: "useEffect",
        }}
      />,
      { width: 80, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[useEffect]");
    expect(frame).toContain("searching");
  });

  test("completed_shows_bracketed_pattern_and_match_count", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <GrepToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "grep",
          searchPattern: "useState",
          totalMatchCount: 5,
          matchedFileCount: 2,
          matchHits: [
            {
              matchFilePath: "/src/App.tsx",
              matchLineNumber: 10,
              matchSnippet: "const [state, setState] = useState(null);",
            },
          ],
        }}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[useState]");
    expect(frame).toContain("5 matches");
    expect(frame).toContain("/src/App.tsx");
  });

  test("completed_shows_returned_and_total_match_hits_when_truncated", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <GrepToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "grep",
          searchPattern: "match",
          totalMatchCount: 105,
          returnedMatchHitCount: 100,
          matchedFileCount: 1,
          wasTruncated: true,
          matchHits: [
            {
              matchFilePath: "notes.txt",
              matchLineNumber: 1,
              matchSnippet: "match 1",
            },
          ],
        }}
      />,
      { width: 140, height: 16 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("100 of 105 matches");
    expect(frame).toContain("truncated");
  });

  test("completed_shortens_long_search_patterns_in_narrow_cards", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <GrepToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "grep",
          searchPattern: "ConversationMessageList|ToolCallHeaderSlots|PromptDraftText",
          totalMatchCount: 5,
          matchedFileCount: 3,
          matchHits: [],
        }}
      />,
      { width: 50, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    const identityLine = frame.split("\n").find((line) => line.includes("Grep"));
    expect(identityLine).toBeDefined();
    expect(identityLine ?? "").not.toContain("ComponentGallery");
    expect(frame).toContain("...");
    expect(frame).toContain("5 matches");
  });

  test("failed_shows_bracketed_pattern_and_error", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <GrepToolCallCard
        renderState="failed"
        toolCallDetail={{
          toolName: "grep",
          searchPattern: "badPattern",
        }}
        errorText="grep failed to run"
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[badPattern]");
    expect(frame).toContain("grep failed");
  });
});
