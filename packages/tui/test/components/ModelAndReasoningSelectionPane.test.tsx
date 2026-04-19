import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { ModelAndReasoningSelectionPane } from "../../src/components/ModelAndReasoningSelectionPane.tsx";

describe("ModelAndReasoningSelectionPane", () => {
  test("renders_heading_and_choices", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ModelAndReasoningSelectionPane
        headingText="Select model"
        visibleChoices={["claude-3-5-sonnet", "claude-3-5-haiku"]}
        highlightedChoiceIndex={0}
      />,
      { width: 60, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Select model");
    expect(frame).toContain("claude-3-5-sonnet");
    expect(frame).toContain("claude-3-5-haiku");
  });

  test("renders_selection_marker_on_highlighted_choice", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ModelAndReasoningSelectionPane
        headingText="Select reasoning effort"
        visibleChoices={["none", "low", "high"]}
        highlightedChoiceIndex={1}
      />,
      { width: 60, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("> low");
  });
});
