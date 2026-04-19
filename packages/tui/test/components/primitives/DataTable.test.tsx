import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { DataTable } from "../../../src/components/primitives/DataTable.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("DataTable (opentui)", () => {
  test("renders header + body rows and locks accentGreen sentinel", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <DataTable
        columnHeaderLabels={["Name", "Value"]}
        bodyRowValues={[
          [<text>alpha</text>, <text>42</text>],
        ]}
      />,
      { width: 80, height: 6 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Name");
    expect(frame).toContain("alpha");
    expect(chatScreenTheme.accentGreen).toBe("#10B981");
    expect(chatScreenTheme.surfaceTwo).toBe("#16161F");
    expect(chatScreenTheme.borderSubtle).toBe("#1E1E2E");
  });
});
