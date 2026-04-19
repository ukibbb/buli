import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { Stripe } from "../../../src/components/primitives/Stripe.tsx";

describe("Stripe", () => {
  test("renders_non_empty_frame", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <Stripe stripeColor="#ff6600" />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    // A full-width coloured row occupies at least one line of the frame.
    expect(captureCharFrame().length).toBeGreaterThan(0);
  });
});
