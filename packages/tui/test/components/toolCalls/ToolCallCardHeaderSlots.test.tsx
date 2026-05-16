import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "../../../src/components/toolCalls/ToolCallCardHeaderSlots.tsx";
import { BracketedTarget } from "../../../src/components/toolCalls/BracketedTarget.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("ToolCallCardHeaderSlots (opentui)", () => {
  test("ToolCallHeaderLeft keeps the label and target on the identity row", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallHeaderLeft
        toolNameLabel="Bash"
        toolTargetContent={<text fg={chatScreenTheme.textMuted}>bun test</text>}
      />,
      { width: 80, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    const singleHeaderLine = frame.split("\n").find((line) => line.includes("Bash"));
    expect(singleHeaderLine).toBeDefined();
    expect(frame).toContain("bun test");
  });

  test("ToolCallHeaderLeft keeps long targets on the tool identity row", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallHeaderLeft
        toolNameLabel="Read"
        toolTargetContent={
          <BracketedTarget
            accentColor={chatScreenTheme.accentAmber}
            targetText="packages/tui/src/components/ConversationMessageList.tsx"
          />
        }
      />,
      { width: 60, height: 4 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    const identityLine = frame.split("\n").find((line) => line.includes("Read"));
    expect(identityLine).toBeDefined();
    expect(identityLine ?? "").not.toContain("≡");
    expect(identityLine ?? "").toContain("[");
    expect(identityLine ?? "").toContain("packages/");
    expect(frame.split("\n").filter((line) => line.includes("packages/"))).toHaveLength(1);
    expect(frame).not.toContain("...");
    expect(frame).not.toContain("…");
  });

  test("ToolCallHeaderLeft omits the target slot when no target content is provided", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallHeaderLeft
        toolNameLabel="TodoWrite"
      />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("TodoWrite");
    expect(frame).not.toContain("☐");
    expect(frame).not.toContain("·");
  });

  test("ToolCallHeaderRight renders status label and ✓ on success", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallHeaderRight
        statusColor={chatScreenTheme.accentGreen}
        statusKind="success"
        statusLabel="exit 0 · 620ms"
      />,
      { width: 30, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("exit 0 · 620ms");
    expect(frame).toContain("✓");
  });

  test("ToolCallHeaderRight clips long status labels without rendering ellipses", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallHeaderRight
        statusColor={chatScreenTheme.accentRed}
        statusKind="error"
        statusLabel="The user denied this edit because the patch touched an unsafe file path"
      />,
      { width: 34, height: 4 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).not.toContain("...");
    expect(frame).not.toContain("…");
    expect(frame).toContain("×");
    expect(frame).not.toContain("unsafe file path");
  });
});
