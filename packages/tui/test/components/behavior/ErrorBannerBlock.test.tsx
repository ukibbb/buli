import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { ErrorBannerBlock } from "../../../src/components/behavior/ErrorBannerBlock.tsx";

describe("ErrorBannerBlock", () => {
  test("shows_error_text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ErrorBannerBlock errorText="auth failed" />,
      { width: 60, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Error");
    expect(frame).toContain("auth failed");
  });

  test("shows_error_text_with_custom_title_and_hint", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ErrorBannerBlock
        titleText="Could not load models"
        errorText="missing client_version"
        errorHintText="Press Esc to close."
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Could not load models");
    expect(frame).toContain("missing client_version");
    expect(frame).toContain("Press Esc to close.");
  });
});
