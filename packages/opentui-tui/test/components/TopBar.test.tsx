import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { TopBar } from "../../src/components/TopBar.tsx";

describe("TopBar", () => {
  test("renders_working_directory_path", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TopBar workingDirectoryPath="/home/user/project" />,
      { width: 60, height: 3 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("/home/user/project");
  });
});
