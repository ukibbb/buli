import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { ShellBlock } from "../../../src/components/primitives/ShellBlock.tsx";

describe("ShellBlock", () => {
  test("renders_prompt_stdout_and_stderr_lines", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ShellBlock
        outputLines={[
          { lineKind: "prompt", lineText: "$ ls -la" },
          { lineKind: "stdout", lineText: "total 42" },
          { lineKind: "stderr", lineText: "permission denied" },
        ]}
      />,
      { width: 60, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("$ ls -la");
    expect(frame).toContain("total 42");
    expect(frame).toContain("permission denied");
  });
});
