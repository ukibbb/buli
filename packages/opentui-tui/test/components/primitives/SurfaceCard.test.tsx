import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { SurfaceCard } from "../../../src/components/primitives/SurfaceCard.tsx";

describe("SurfaceCard", () => {
  test("renders_header_text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <SurfaceCard
        stripeColor="#ff6600"
        headerLeft={<text>Tool</text>}
      />,
      { width: 60, height: 10 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("Tool");
  });

  test("renders_body_content_when_supplied", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <SurfaceCard
        stripeColor="#00ff00"
        headerLeft={<text>Header</text>}
        bodyContent={<text>Body text</text>}
      />,
      { width: 60, height: 12 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Header");
    expect(frame).toContain("Body text");
  });
});
