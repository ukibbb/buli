import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { KeyValueList } from "../../../src/components/primitives/KeyValueList.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("KeyValueList (opentui)", () => {
  test("renders keys and value content", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <KeyValueList entries={[
        { entryKeyLabel: "$ novibe", entryValueContent: <text>A reading-first knowledge base</text> },
      ]} />,
      { width: 80, height: 4 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("$ novibe");
    expect(frame).toContain("A reading-first knowledge base");
    expect(chatScreenTheme.accentCyan).toBe("#22D3EE");
  });
});
