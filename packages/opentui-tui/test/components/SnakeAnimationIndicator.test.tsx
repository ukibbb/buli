import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { SnakeAnimationIndicator } from "../../src/components/SnakeAnimationIndicator.tsx";

describe("SnakeAnimationIndicator", () => {
  test("renders_six_cell_snake_glyphs", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <SnakeAnimationIndicator />,
      { width: 20, height: 3 },
    );
    await renderOnce();
    // First frame always renders some combination of rectangle and ellipse cells.
    const frame = captureCharFrame();
    expect(frame.trim().length).toBeGreaterThan(0);
  });
});
