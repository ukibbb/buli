import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { PlanProposalBlock } from "../../../src/components/behavior/PlanProposalBlock.tsx";

describe("PlanProposalBlock", () => {
  test("shows_plan_title_and_step", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <PlanProposalBlock
        planTitle="Refactor auth module"
        planSteps={[
          { stepIndex: 0, stepTitle: "Audit current auth code", stepStatus: "completed" },
          { stepIndex: 1, stepTitle: "Extract token validator", stepStatus: "in_progress" },
          { stepIndex: 2, stepTitle: "Write tests", stepStatus: "pending" },
        ]}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Refactor auth module");
    expect(frame).toContain("Audit current auth code");
  });

  test("shows_all_three_steps", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <PlanProposalBlock
        planTitle="Deploy pipeline"
        planSteps={[
          { stepIndex: 0, stepTitle: "Build image", stepStatus: "completed" },
          { stepIndex: 1, stepTitle: "Push to registry", stepStatus: "in_progress" },
          { stepIndex: 2, stepTitle: "Deploy to staging", stepStatus: "pending" },
        ]}
      />,
      { width: 80, height: 25 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Build image");
    expect(frame).toContain("Push to registry");
    expect(frame).toContain("Deploy to staging");
  });
});
