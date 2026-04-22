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
