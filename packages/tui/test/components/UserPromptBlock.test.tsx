import { describe, expect, test } from "bun:test";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { testRender } from "../testRenderWithCleanup.ts";
import { UserPromptBlock } from "../../src/components/UserPromptBlock.tsx";

describe("UserPromptBlock", () => {
  test("renders_prompt_text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <UserPromptBlock
        promptText="what is the capital of France?"
        userPromptBorderColor={chatScreenTheme.accentGreen}
      />,
      { width: 60, height: 4 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("what is the capital of France?");
  });

  test("renders_l_shaped_user_prompt_frame", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <UserPromptBlock promptText="hello" userPromptBorderColor={chatScreenTheme.accentPink} />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    const bottomBorderLine = frame.split("\n").find((line) => line.includes("└"));

    expect(frame).toContain("│ hello");
    expect(bottomBorderLine?.trimEnd()).toBe(`└${"─".repeat(39)}`);
    expect(chatScreenTheme.accentPink).toBe("#EC4899");
  });

  test("does_not_render_legacy_prompt_caret", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <UserPromptBlock promptText="hello" userPromptBorderColor={chatScreenTheme.accentAmber} />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).not.toContain("›");
    expect(frame).not.toContain(">");
  });
});
