import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { NumberedList } from "../../../src/components/primitives/NumberedList.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("NumberedList", () => {
  test("renders_numbers_and_items", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <NumberedList
        itemContents={[
          <text key="a">first</text>,
          <text key="b">second</text>,
        ]}
      />,
      { width: 40, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("01.");
    expect(frame).toContain("02.");
    expect(frame).toContain("first");
    expect(frame).toContain("second");
    expect(chatScreenTheme.accentGreen).toBe("#10B981");
  });

  test("respects_startingIndex", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <NumberedList
        startingIndex={5}
        itemContents={[
          <text key="a">five</text>,
          <text key="b">six</text>,
        ]}
      />,
      { width: 40, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("05.");
    expect(frame).toContain("06.");
  });
});
