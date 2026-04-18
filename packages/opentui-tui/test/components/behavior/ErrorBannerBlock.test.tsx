import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { ErrorBannerBlock } from "../../../src/components/behavior/ErrorBannerBlock.tsx";

describe("ErrorBannerBlock", () => {
  test("shows_error_text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ErrorBannerBlock errorText="auth failed" />,
      { width: 60, height: 8 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("auth failed");
  });

  test("shows_error_text_with_hint", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ErrorBannerBlock errorText="connection refused" errorHintText="check your network" />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("connection refused");
    expect(frame).toContain("check your network");
  });
});
