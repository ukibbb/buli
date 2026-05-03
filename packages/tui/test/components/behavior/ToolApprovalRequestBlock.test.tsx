import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { ToolApprovalRequestBlock } from "../../../src/components/behavior/ToolApprovalRequestBlock.tsx";

describe("ToolApprovalRequestBlock", () => {
  test("shows_risk_explanation_and_decision_controls", async () => {
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
    expect(frame).toContain("Approval needed");
    expect(frame).toContain("This command deletes files permanently");
    expect(frame).toContain("[ y ] yes");
    expect(frame).toContain("[ n ] no");
  });
});
