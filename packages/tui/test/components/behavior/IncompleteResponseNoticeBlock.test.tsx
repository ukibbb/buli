import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { IncompleteResponseNoticeBlock } from "../../../src/components/behavior/IncompleteResponseNoticeBlock.tsx";

describe("IncompleteResponseNoticeBlock", () => {
  test("shows_incomplete_reason", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <IncompleteResponseNoticeBlock incompleteReason="model stopped at max tokens" />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("model stopped at max tokens");
  });

  test("shows_response_incomplete_title", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <IncompleteResponseNoticeBlock incompleteReason="context window full" />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Response incomplete");
    expect(frame).toContain("context window full");
  });
});
