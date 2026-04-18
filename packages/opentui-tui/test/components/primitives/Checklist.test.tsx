import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { Checklist } from "../../../src/components/primitives/Checklist.tsx";

describe("Checklist", () => {
  test("renders_all_status_glyphs_and_titles", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <Checklist
        items={[
          { itemTitle: "do pending", itemStatus: "pending" },
          { itemTitle: "doing now", itemStatus: "in_progress" },
          { itemTitle: "all done", itemStatus: "completed" },
        ]}
      />,
      { width: 40, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    // pending uses "·", in_progress uses "▸", completed uses "✓"
    expect(frame).toContain("·");
    expect(frame).toContain("▸");
    expect(frame).toContain("✓");
    expect(frame).toContain("do pending");
    expect(frame).toContain("doing now");
    expect(frame).toContain("all done");
  });
});
