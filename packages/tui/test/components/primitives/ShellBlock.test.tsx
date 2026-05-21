import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
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

  test("renders_all_output_lines", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ShellBlock
        outputLines={[
          { lineKind: "prompt", lineText: "$ ls -la" },
          { lineKind: "stdout", lineText: "total 42" },
          { lineKind: "stdout", lineText: "visible third line" },
        ]}
      />,
      { width: 60, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("$ ls -la");
    expect(frame).toContain("total 42");
    expect(frame).toContain("visible third line");
    expect(frame).not.toContain("showing first");
  });

  test("limits_large_output_transcripts", async () => {
    const outputLines = Array.from({ length: 55 }, (_value, index) => ({
      lineKind: "stdout" as const,
      lineText: `line ${index + 1}`,
    }));
    const { captureCharFrame, renderOnce } = await testRender(
      <ShellBlock outputLines={outputLines} />,
      { width: 70, height: 70 },
    );
    await renderOnce();
    const frame = captureCharFrame();

    expect(frame).toContain("showing first 50 of 55 lines");
    expect(frame).toContain("line 1");
    expect(frame).toContain("line 50");
    expect(frame).not.toContain("line 51");
  });
});
