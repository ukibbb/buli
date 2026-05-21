import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { ThinkingStatusLine } from "../../src/components/ThinkingStatusLine.tsx";

describe("ThinkingStatusLine", () => {
  test("renders_apple_snake_and_thinking_label", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ThinkingStatusLine thinkingStartedAtMs={Date.now() - 1500} />,
      { width: 40, height: 3 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("◆");
    expect(frame).toContain("Thinking");
    expect(frame).not.toMatch(/\d+\.\ds/);
  });

  test("renders_optional_thinking_topic", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ThinkingStatusLine thinkingStartedAtMs={Date.now() - 1500} thinkingTopicText="Checking files" />,
      { width: 60, height: 3 },
    );

    await renderOnce();
    expect(captureCharFrame()).toContain("Thinking: Checking files");
  });
});
