import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { ReasoningCollapsedChip } from "../../src/components/ReasoningCollapsedChip.tsx";

describe("ReasoningCollapsedChip", () => {
  test("renders_duration_without_token_count", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReasoningCollapsedChip reasoningDurationMs={2500} reasoningTokenCount={undefined} />,
      { width: 60, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("thinking");
    expect(frame).toContain("2.5s");
  });

  test("renders_token_count_when_provided", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReasoningCollapsedChip reasoningDurationMs={1000} reasoningTokenCount={512} />,
      { width: 60, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("512 tokens");
  });
});
