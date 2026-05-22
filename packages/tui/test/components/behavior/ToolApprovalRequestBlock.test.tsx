import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { ToolApprovalRequestBlock } from "../../../src/components/behavior/ToolApprovalRequestBlock.tsx";

describe("ToolApprovalRequestBlock", () => {
  test("shows_one_line_risk_explanation_and_decision_buttons", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolApprovalRequestBlock
        riskExplanation="This command deletes files permanently"
        onApprove={() => {}}
        onDeny={() => {}}
      />,
      { width: 100, height: 6 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("This command deletes files permanently");
    expect(frame).toContain("Yes");
    expect(frame).toContain("No");
    expect(frame).not.toContain("Approval needed");
    expect(frame).not.toContain("[ y ] yes");
    expect(frame).not.toContain("[ n ] no");
  });
});
