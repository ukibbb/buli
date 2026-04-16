import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { BashToolCallCard } from "../../../src/components/toolCalls/BashToolCallCard.tsx";

describe("BashToolCallCard", () => {
  test("completed_zero_exit_shows_command_and_status", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BashToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "bash",
          commandLine: "ls -la /tmp",
          exitCode: 0,
          outputLines: [
            { lineKind: "stdout", lineText: "total 8" },
            { lineKind: "stdout", lineText: "drwxr-xr-x  2 root root 4096 Apr 16 10:00 ." },
          ],
        }}
        durationMs={120}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("ls -la /tmp");
    expect(frame).toContain("exit 0");
    expect(frame).toContain("total 8");
  });

  test("failed_shows_error_text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BashToolCallCard
        renderState="failed"
        toolCallDetail={{
          toolName: "bash",
          commandLine: "rm -rf /",
        }}
        errorText="command blocked"
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("rm -rf /");
    expect(frame).toContain("command blocked");
  });
});
