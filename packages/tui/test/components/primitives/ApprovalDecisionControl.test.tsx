import { describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { ApprovalDecisionControl } from "../../../src/components/primitives/ApprovalDecisionControl.tsx";

describe("ApprovalDecisionControl (opentui)", () => {
  test("renders_yes_and_no_buttons", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ApprovalDecisionControl onApprove={() => {}} onDeny={() => {}} />,
      { width: 40, height: 5 },
    );
    await renderOnce();
    const frame = captureCharFrame();

    expect(frame).toContain("Yes");
    expect(frame).toContain("No");
    expect(frame).not.toContain("[ y ] yes");
    expect(frame).not.toContain("[ n ] no");
  });

  test("activates_buttons_with_mouse_clicks", async () => {
    let approvalCount = 0;
    let denialCount = 0;
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <ApprovalDecisionControl
        onApprove={() => {
          approvalCount += 1;
        }}
        onDeny={() => {
          denialCount += 1;
        }}
      />,
      { width: 40, height: 5 },
    );

    await renderOnce();
    const yesTarget = findRenderedFrameTextPosition(captureCharFrame(), "Yes");
    const noTarget = findRenderedFrameTextPosition(captureCharFrame(), "No");

    await act(async () => {
      await mockMouse.click(yesTarget.column, yesTarget.row);
      await mockMouse.click(noTarget.column, noTarget.row);
    });

    expect(approvalCount).toBe(1);
    expect(denialCount).toBe(1);
  });
});

function findRenderedFrameTextPosition(renderedOutput: string, targetText: string): { column: number; row: number } {
  const renderedRows = renderedOutput.split("\n");
  const row = renderedRows.findIndex((renderedRow) => renderedRow.includes(targetText));
  if (row === -1) {
    throw new Error(`expected rendered output to contain ${targetText}`);
  }

  const column = renderedRows[row]?.indexOf(targetText) ?? -1;
  if (column === -1) {
    throw new Error(`expected rendered row to contain ${targetText}`);
  }

  return { column, row };
}
