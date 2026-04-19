import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { ReasoningStreamBlock } from "../../src/components/ReasoningStreamBlock.tsx";

import { chatScreenTheme } from "@buli/assistant-design-tokens";

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
    expect(frame).toContain("// reasoning");
    expect(frame).toContain("The user wants to know about prime numbers.");
  });

  test("renders '// reasoning' label, summary text, and locks tokens", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReasoningStreamBlock
        reasoningSummaryText="Walking the project tree."
        reasoningStartedAtMs={Date.now() - 3200}
      />,
      { width: 80, height: 6 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("// reasoning");
    expect(frame).toContain("Walking the project tree.");
    expect(chatScreenTheme.accentAmber).toBe("#F59E0B");
    expect(chatScreenTheme.textDim).toBe("#475569");
  });
});
