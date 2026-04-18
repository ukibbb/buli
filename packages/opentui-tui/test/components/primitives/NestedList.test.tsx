import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { NestedList } from "../../../src/components/primitives/NestedList.tsx";

describe("NestedList", () => {
  test("renders_top_level_items_with_bullet", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <NestedList
        items={[
          { itemContent: <text>parent one</text> },
          { itemContent: <text>parent two</text> },
        ]}
      />,
      { width: 40, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("·");
    expect(frame).toContain("parent one");
    expect(frame).toContain("parent two");
  });

  test("renders_nested_children_with_hollow_bullet", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <NestedList
        items={[
          {
            itemContent: <text>parent</text>,
            childItems: [{ itemContent: <text>child</text> }],
          },
        ]}
      />,
      { width: 40, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("parent");
    expect(frame).toContain("child");
    expect(frame).toContain("∘");
  });
});
