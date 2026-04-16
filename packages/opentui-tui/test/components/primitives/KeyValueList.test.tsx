import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { KeyValueList } from "../../../src/components/primitives/KeyValueList.tsx";

describe("KeyValueList", () => {
  test("renders_keys_and_values", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <KeyValueList
        entries={[
          { entryKeyLabel: "host", entryValueContent: <text>localhost</text> },
          { entryKeyLabel: "port", entryValueContent: <text>3000</text> },
        ]}
      />,
      { width: 40, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("host");
    expect(frame).toContain("localhost");
    expect(frame).toContain("port");
    expect(frame).toContain("3000");
  });
});
