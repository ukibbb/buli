import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { ReasoningStreamBlock } from "../../src/components/ReasoningStreamBlock.tsx";

describe("ReasoningStreamBlock", () => {
  test("renders_reasoning_text_and_header", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReasoningStreamBlock
        reasoningSummaryText="The user wants to know about prime numbers."
        reasoningStartedAtMs={Date.now() - 1500}
      />,
      { width: 80, height: 6 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Streaming");
    expect(frame).toContain("The user wants to know about prime numbers.");
  });
});
