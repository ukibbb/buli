import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { TopBar } from "../../src/components/TopBar.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "../../src/components/glyphs.ts";

describe("TopBar", () => {
  test("renders_working_directory_path", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TopBar workingDirectoryPath="/home/user/project" accentColor={chatScreenTheme.accentGreen} />,
      { width: 60, height: 3 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("/home/user/project");
  });

  test("uses_supplied_accent_status_dot_and_textSecondary_path", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TopBar workingDirectoryPath="~/workspace/novibe/apps/api" accentColor={chatScreenTheme.accentPink} />,
      { width: 80, height: 2 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain(glyphs.statusDot);
    expect(frame).toContain("~/workspace/novibe/apps/api");
    expect(chatScreenTheme.accentPink).toBe("#EC4899");
    expect(chatScreenTheme.textSecondary).toBe("#94A3B8");
  });
});
