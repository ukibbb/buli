import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { ApprovalDecisionControl } from "../../../src/components/primitives/ApprovalDecisionControl.tsx";

describe("ApprovalDecisionControl (opentui)", () => {
  test("renders_bracketed_shortcut_letters_with_action_words", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ApprovalDecisionControl onApprove={() => {}} onDeny={() => {}} />,
      { width: 40, height: 5 },
    );
    await renderOnce();
    const frame = captureCharFrame();

    expect(frame).toContain("[ y ] yes");
    expect(frame).toContain("[ n ] no");
  });
});
