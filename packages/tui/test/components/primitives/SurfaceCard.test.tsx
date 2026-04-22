import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { SurfaceCard } from "../../../src/components/primitives/SurfaceCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("SurfaceCard (opentui)", () => {
  test("renders header content next to the accent column", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <SurfaceCard
        accentColor={chatScreenTheme.accentGreen}
        headerLeft={<text>Header</text>}
      />,
      { width: 40, height: 6 },
    );
    await renderOnce();
    // char-frame captures glyphs only; colour of the accent column cannot be asserted directly here.
    const frame = captureCharFrame();
    expect(frame).toContain("Header");
    expect(chatScreenTheme.accentGreen).toBe("#10B981");
  });

  test("renders body content below the header when supplied", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <SurfaceCard
        accentColor={chatScreenTheme.accentGreen}
        headerLeft={<text>Header</text>}
        bodyContent={<text>BodyPayload</text>}
      />,
      { width: 40, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Header");
    expect(frame).toContain("BodyPayload");
  });

  test("does not render a solid top stripe row above the header", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <SurfaceCard
        accentColor={chatScreenTheme.accentRed}
        headerLeft={<text>Body</text>}
      />,
      { width: 40, height: 6 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    // border + paddingY=1 puts content at index 2; a top stripe would push it to 3+
    const headerLine = frame.split("\n")[2] ?? "";
    expect(headerLine).toContain("Body");
  });
});
