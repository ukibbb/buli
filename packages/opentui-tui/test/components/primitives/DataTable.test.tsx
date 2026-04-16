import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { DataTable } from "../../../src/components/primitives/DataTable.tsx";

describe("DataTable", () => {
  test("renders_headers_and_body_rows", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <DataTable
        columnHeaderLabels={["Name", "Value"]}
        bodyRowValues={[
          [<text key="n1">alpha</text>, <text key="v1">42</text>],
          [<text key="n2">beta</text>, <text key="v2">99</text>],
        ]}
      />,
      { width: 40, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Name");
    expect(frame).toContain("Value");
    expect(frame).toContain("alpha");
    expect(frame).toContain("42");
    expect(frame).toContain("beta");
    expect(frame).toContain("99");
  });
});
