import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { GrepToolCallCard } from "../../../src/components/toolCalls/GrepToolCallCard.tsx";

describe("GrepToolCallCard", () => {
  test("completed_shows_pattern_and_match_count", async () => {
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
    expect(frame).toContain("useState");
    expect(frame).toContain("5 matches");
    expect(frame).toContain("/src/App.tsx");
  });

  test("failed_shows_error_state", async () => {
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
    expect(frame).toContain("badPattern");
    expect(frame).toContain("grep failed");
  });
});
