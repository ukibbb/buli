import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { RateLimitNoticeBlock } from "../../../src/components/behavior/RateLimitNoticeBlock.tsx";

describe("RateLimitNoticeBlock", () => {
  test("shows_limit_explanation", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <RateLimitNoticeBlock
        retryAfterSeconds={30}
        limitExplanation="Daily token limit reached"
        noticeStartedAtMs={Date.now()}
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("Daily token limit reached");
  });

  test("shows_rate_limit_title_and_countdown", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <RateLimitNoticeBlock
        retryAfterSeconds={60}
        retryReason="rate_limit"
        limitExplanation="Requests per minute exceeded"
        noticeStartedAtMs={Date.now()}
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Rate limit pending");
    expect(frame).toContain("Requests per minute exceeded");
    expect(frame).toContain("retrying in");
  });

  test("shows_connection_retry_title_for_transport_failures", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <RateLimitNoticeBlock
        retryAfterSeconds={1}
        retryReason="transport_error"
        limitExplanation="OpenAI request failed before receiving a response. Retrying after 1 second."
        noticeStartedAtMs={Date.now() - 1_000}
      />,
      { width: 100, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Connection retry pending");
    expect(frame).toContain("retrying now");
  });
});
