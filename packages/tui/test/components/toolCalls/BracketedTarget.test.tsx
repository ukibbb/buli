import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { BracketedTarget } from "../../../src/components/toolCalls/BracketedTarget.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("BracketedTarget (opentui)", () => {
  test("wraps plain-text target with coloured brackets and muted text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BracketedTarget accentColor={chatScreenTheme.accentGreen} targetText="bun test" />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[bun test]");
  });

  test("middle-truncates long plain-text targets before the terminal wraps them", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BracketedTarget
        accentColor={chatScreenTheme.accentGreen}
        targetText="packages/tui/src/components/ConversationMessageList.tsx"
      />,
      { width: 34, height: 4 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[");
    expect(frame).toContain("…");
    expect(frame).toContain("]");
    expect(frame).not.toContain("ConversationMessageList.tsx");
  });

  test("accepts a ReactNode as target for rich content", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <BracketedTarget accentColor={chatScreenTheme.accentRed}>
        <text fg={chatScreenTheme.textMuted}>rich</text>
      </BracketedTarget>,
      { width: 40, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[rich]");
  });
});
