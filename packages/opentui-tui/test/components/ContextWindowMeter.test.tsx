import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { ContextWindowMeter } from "../../src/components/ContextWindowMeter.tsx";

describe("ContextWindowMeter", () => {
  test("renders_fallback_when_no_tokens_used", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={undefined} contextWindowTokenCapacity={undefined} />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("ctx --");
  });

  test("renders_raw_token_count_when_no_capacity", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={500} contextWindowTokenCapacity={undefined} />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("500 tok");
  });

  test("renders_bar_and_percentage_when_capacity_known", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={50000} contextWindowTokenCapacity={200000} />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("25%");
    expect(frame).toContain("ctx");
  });
});
