import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { BashToolCallCard } from "../../../src/components/toolCalls/BashToolCallCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("BashToolCallCard (opentui)", () => {
  test("streaming uses amber accent and renders [command] with running status", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BashToolCallCard
        toolCallDetail={{ toolName: "bash", commandLine: "bun test" }}
        renderState="streaming"
      />,
      { width: 120, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Bash");
    expect(frame).toContain("[bun test]");
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
    expect(frame).toContain("[ls]");
    expect(frame).toContain("exit 0");
    expect(chatScreenTheme.accentGreen).toBe("#10B981");
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
    expect(frame).toContain("[false]");
    expect(frame).toContain("Permission denied");
  });
});
