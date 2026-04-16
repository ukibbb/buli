import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { DiffBlock } from "../../../src/components/primitives/DiffBlock.tsx";

describe("DiffBlock", () => {
  test("renders_addition_removal_and_context_lines", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <DiffBlock
        diffLines={[
          { lineKind: "addition", lineNumber: 1, lineText: "added line" },
          { lineKind: "removal", lineNumber: 2, lineText: "removed line" },
          { lineKind: "context", lineNumber: 3, lineText: "context line" },
        ]}
      />,
      { width: 60, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("+");
    expect(frame).toContain("-");
    expect(frame).toContain("added line");
    expect(frame).toContain("removed line");
    expect(frame).toContain("context line");
  });
});
