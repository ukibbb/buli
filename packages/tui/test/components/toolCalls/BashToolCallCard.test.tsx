import { describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { BashToolCallCard } from "../../../src/components/toolCalls/BashToolCallCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("BashToolCallCard (opentui)", () => {
  test("streaming uses amber accent and renders command with pending status", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BashToolCallCard
        toolCallDetail={{ toolName: "bash", commandLine: "bun test" }}
        renderState="streaming"
      />,
      { width: 120, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[+]");
    expect(frame).toContain("Bash");
    expect(frame).toContain("[bun test]");
    expect(frame).toContain("◆");
    expect(frame).toContain("running");
    expect(chatScreenTheme.accentAmber).toBe("#F59E0B");
  });

  test("completed exit 0 uses green accent and shows exit 0 status", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BashToolCallCard
        toolCallDetail={{ toolName: "bash", commandLine: "ls", exitCode: 0 }}
        renderState="completed"
        durationMs={250}
      />,
      { width: 120, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[+]");
    expect(frame).toContain("[ls]");
    expect(frame).toContain("exit 0");
    expect(chatScreenTheme.accentGreen).toBe("#10B981");
  });

  test("completed_with_workspace_patch_expands_output_and_actual_diff", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <BashToolCallCard
        toolCallDetail={{
          toolName: "bash",
          commandLine: "bun run generate",
          exitCode: 0,
          outputLines: [{ lineKind: "stdout", lineText: "generated files" }],
        }}
        renderState="completed"
        durationMs={250}
        workspacePatch={{
          workspacePatchId: "patch-1",
          toolCallId: "call-bash-1",
          capturedAtMs: 1,
          baselineSnapshotHash: "before",
          resultingSnapshotHash: "after",
          changedFileCount: 1,
          addedLineCount: 1,
          removedLineCount: 0,
          changedFiles: [
            {
              filePath: "src/generated.ts",
              changeKind: "added",
              addedLineCount: 1,
              removedLineCount: 0,
              unifiedDiffText: [
                "diff --git a/src/generated.ts b/src/generated.ts",
                "--- a/src/generated.ts",
                "+++ b/src/generated.ts",
                "@@ -0,0 +1,1 @@",
                "+export const generated = true;",
                "",
              ].join("\n"),
            },
          ],
        }}
      />,
      { width: 120, height: 20 },
    );

    await renderOnce();
    const collapsedFrame = captureCharFrame();
    expect(collapsedFrame).toContain("[+]");
    expect(collapsedFrame).toContain("exit 0");
    expect(collapsedFrame).toContain("1 file");
    expect(collapsedFrame).toContain("+1");
    expect(collapsedFrame).toContain("-0");
    expect(collapsedFrame).not.toContain("generated files");
    expect(collapsedFrame).not.toContain("export const generated");

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("[-]");
    expect(expandedFrame).toContain("generated files");
    expect(expandedFrame).toContain("A src/generated.ts (+1 -0)");
    expect(expandedFrame).toContain("export const generated");
  });

  test("completed exit 1 uses red accent and shows exit 1 status", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BashToolCallCard
        toolCallDetail={{ toolName: "bash", commandLine: "bun run build", exitCode: 1 }}
        renderState="completed"
        durationMs={2400}
      />,
      { width: 120, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[+]");
    expect(frame).toContain("[bun run build]");
    expect(frame).toContain("exit 1");
    expect(chatScreenTheme.accentRed).toBe("#EF4444");
  });

  test("failed uses red accent and renders error text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BashToolCallCard
        toolCallDetail={{ toolName: "bash", commandLine: "false" }}
        renderState="failed"
        errorText="Permission denied"
      />,
      { width: 120, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[+]");
    expect(frame).toContain("[false]");
    expect(frame).toContain("Permission denied");
  });
});
