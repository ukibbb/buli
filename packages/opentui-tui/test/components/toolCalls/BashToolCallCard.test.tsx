import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { BashToolCallCard } from "../../../src/components/toolCalls/BashToolCallCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("BashToolCallCard (opentui)", () => {
  test("streaming renders command line and accentAmber sentinel with running status", async () => {
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
    expect(frame).toContain("running");
    expect(chatScreenTheme.accentAmber).toBe("#F59E0B");
  });

  test("completed exit 0 renders exit label and accentGreen sentinel", async () => {
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
    expect(frame).toContain("exit");
    expect(frame).toContain("0");
    expect(chatScreenTheme.accentGreen).toBe("#10B981");
  });

  test("completed exit non-zero renders exit code and accentRed sentinel", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BashToolCallCard
        toolCallDetail={{ toolName: "bash", commandLine: "false", exitCode: 1 }}
        renderState="completed"
        durationMs={50}
      />,
      { width: 120, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("exit");
    expect(frame).toContain("1");
    expect(chatScreenTheme.accentRed).toBe("#EF4444");
  });

  test("failed renders accentRed sentinel and error text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BashToolCallCard
        toolCallDetail={{ toolName: "bash", commandLine: "ls /nope" }}
        renderState="failed"
        errorText="command not found"
      />,
      { width: 120, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("not");
    expect(frame).toContain("found");
    expect(chatScreenTheme.accentRed).toBe("#EF4444");
  });
});
