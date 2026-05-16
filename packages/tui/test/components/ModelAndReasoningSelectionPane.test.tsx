import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { ModelAndReasoningSelectionPane } from "../../src/components/ModelAndReasoningSelectionPane.tsx";

describe("ModelAndReasoningSelectionPane", () => {
  test("renders_choices_without_heading", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ModelAndReasoningSelectionPane
        visibleChoices={["claude-3-5-sonnet", "claude-3-5-haiku"]}
        highlightedChoiceIndex={0}
        accentColor="#00ff00"
      />,
      { width: 60, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("claude-3-5-sonnet");
    expect(frame).toContain("claude-3-5-haiku");
    expect(frame).not.toContain("▶");
  });

  test("renders_highlighted_choice_without_selection_marker", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ModelAndReasoningSelectionPane
        visibleChoices={["none", "low", "high"]}
        highlightedChoiceIndex={1}
        accentColor="#00ff00"
      />,
      { width: 60, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("low");
    expect(frame).not.toContain("▶");
  });
});
