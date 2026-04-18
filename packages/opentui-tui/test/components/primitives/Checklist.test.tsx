import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { Checklist } from "../../../src/components/primitives/Checklist.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("Checklist (opentui)", () => {
  test("renders ☐ pending and ☑ completed glyphs", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <Checklist items={[
        { itemTitle: "draft the terminal palette", itemStatus: "completed" },
        { itemTitle: "wire the kinds into the library reader", itemStatus: "pending" },
      ]} />,
      { width: 60, height: 5 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("☑");
    expect(frame).toContain("☐");
    expect(frame).toContain("draft the terminal palette");
    expect(frame).toContain("wire the kinds into the library reader");
    // Sentinel — completed glyph color must remain bound to accentCyan.
    expect(chatScreenTheme.accentCyan).toBe("#22D3EE");
  });
});
