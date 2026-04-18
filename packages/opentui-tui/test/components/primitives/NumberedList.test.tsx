import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { NumberedList } from "../../../src/components/primitives/NumberedList.tsx";

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
    expect(frame).toContain("1.");
    expect(frame).toContain("2.");
    expect(frame).toContain("first");
    expect(frame).toContain("second");
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
    expect(frame).toContain("5.");
    expect(frame).toContain("6.");
  });
});
