import { describe, expect, test } from "bun:test";
import { PromptContextSelectionPane } from "../../src/components/PromptContextSelectionPane.tsx";
import { testRender } from "../testRenderWithCleanup.ts";

function countRenderedLinesMatchingPattern(renderedOutput: string, pattern: RegExp): number {
  return renderedOutput.split("\n").filter((renderedLine) => pattern.test(renderedLine)).length;
}

describe("PromptContextSelectionPane", () => {
  test("keeps_each_long_candidate_on_one_visual_row", async () => {
    const longDisplayPath = "/Users/lukasz/Desktop/Projekty/buli/.bun/install/cache/@babel/helper-annotate-as-pure@7.27.3@@@1/README.md";
    const { captureCharFrame, renderOnce } = await testRender(
      <PromptContextSelectionPane
        promptContextCandidates={[
          {
            kind: "file",
            displayPath: longDisplayPath,
            promptReferenceText: `@${longDisplayPath}`,
          },
        ]}
        highlightedPromptContextCandidateIndex={0}
      />,
      { width: 58, height: 6 },
    );

    await renderOnce();

    expect(countRenderedLinesMatchingPattern(captureCharFrame(), /install\/cache|helper-annotate|README\.md/)).toBe(1);
  });

  test("keeps_the_highlighted_candidate_visible_after_the_first_six_results", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <PromptContextSelectionPane
        promptContextCandidates={Array.from({ length: 8 }, (_value, index) => ({
          kind: "file" as const,
          displayPath: `project/file-${index + 1}.ts`,
          promptReferenceText: `@project/file-${index + 1}.ts`,
        }))}
        highlightedPromptContextCandidateIndex={6}
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    const renderedOutput = captureCharFrame();
    expect(renderedOutput).toContain("project/file-7.ts");
    expect(renderedOutput).not.toContain("project/file-1.ts");
  });
});
