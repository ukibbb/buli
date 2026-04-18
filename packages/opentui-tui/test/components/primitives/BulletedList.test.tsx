import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { BulletedList } from "../../../src/components/primitives/BulletedList.tsx";

describe("BulletedList", () => {
  test("renders_bullet_glyph_and_items", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BulletedList
        itemContents={[
          <text key="a">alpha</text>,
          <text key="b">beta</text>,
          <text key="c">gamma</text>,
        ]}
      />,
      { width: 40, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("·");
    expect(frame).toContain("alpha");
    expect(frame).toContain("beta");
    expect(frame).toContain("gamma");
  });
});
