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
    expect(frame).toContain("┃");
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

  test("renders a left rail without the old full rounded shell", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <SurfaceCard
        accentColor={chatScreenTheme.accentRed}
        headerLeft={<text>Body</text>}
      />,
      { width: 40, height: 6 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("┃");
    expect(frame).not.toContain("╭");
    expect(frame).not.toContain("╮");
    expect(frame).toContain("Body");
  });
});
