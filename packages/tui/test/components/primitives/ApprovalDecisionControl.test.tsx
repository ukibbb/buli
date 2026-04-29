import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { ApprovalDecisionControl } from "../../../src/components/primitives/ApprovalDecisionControl.tsx";

describe("ApprovalDecisionControl (opentui)", () => {
  test("renders_yes_and_no_inside_one_bordered_control", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ApprovalDecisionControl />,
      { width: 40, height: 5 },
    );
    await renderOnce();
    const frame = captureCharFrame();

    expect(frame).toContain("y Yes");
    expect(frame).toContain("n No");
    expect(frame).toContain("╭");
    expect(frame).toContain("╰");
    expect(frame).toContain("│");
  });
});
