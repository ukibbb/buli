import { describe, expect, test } from "bun:test";
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

  test("completed with small output expands output by default", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BashToolCallCard
        toolCallDetail={{
          toolName: "bash",
          commandLine: "pwd",
          exitCode: 0,
          outputLines: [{ lineKind: "stdout", lineText: "/tmp/demo" }],
        }}
        renderState="completed"
        durationMs={250}
      />,
      { width: 120, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[-]");
    expect(frame).toContain("/tmp/demo");
  });

  test("completed_with_small_output_no_longer_includes_workspace_patch_summary", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BashToolCallCard
        toolCallDetail={{
          toolName: "bash",
          commandLine: "bun run generate",
          exitCode: 0,
          outputLines: [{ lineKind: "stdout", lineText: "generated files" }],
        }}
        renderState="completed"
        durationMs={250}
      />,
      { width: 120, height: 10 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[-]");
    expect(frame).toContain("exit 0");
    expect(frame).toContain("generated files");
    expect(frame).not.toContain("workspace patch");
    expect(frame).not.toContain("export const generated");
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
