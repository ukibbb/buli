import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { UserPromptBlock } from "../../src/components/UserPromptBlock.tsx";

describe("UserPromptBlock", () => {
  test("renders_prompt_text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <UserPromptBlock promptText="what is the capital of France?" />,
      { width: 60, height: 4 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("what is the capital of France?");
  });

  test("renders_caret_glyph", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <UserPromptBlock promptText="hello" />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain(">");
  });
});
