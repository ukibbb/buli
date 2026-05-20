import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { ThinkingStatusLine } from "../../src/components/ThinkingStatusLine.tsx";

describe("ThinkingStatusLine", () => {
  test("renders_only_the_snake_animation", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ThinkingStatusLine thinkingStartedAtMs={Date.now() - 1500} />,
      { width: 40, height: 3 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("▰");
    expect(frame).not.toContain("Thinking");
    expect(frame).not.toMatch(/\d+\.\ds/);
  });
});
