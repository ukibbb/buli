import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { SlashCommandSelectionPane } from "../../src/components/SlashCommandSelectionPane.tsx";

function findRenderedRowContaining(renderedOutput: string, expectedText: string): string {
  const renderedRow = renderedOutput.split("\n").find((row) => row.includes(expectedText));
  if (!renderedRow) {
    throw new Error(`expected rendered output to contain a row with ${expectedText}`);
  }

  return renderedRow;
}

describe("SlashCommandSelectionPane", () => {
  test("renders_commands_with_descriptions", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <SlashCommandSelectionPane
        availableSlashCommands={[
          { name: "help", value: "help", description: "Show available commands" },
          { name: "model", value: "model", description: "Choose model and reasoning effort" },
        ]}
        highlightedSlashCommandIndex={0}
        accentColor="#00ff00"
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).not.toContain("Commands");
    expect(frame).toContain("/help");
    expect(frame).toContain("Show available commands");
    expect(frame).toContain("/model");
    expect(frame).toContain("Choose model and reasoning effort");

    const helpRow = findRenderedRowContaining(frame, "/help");
    const modelRow = findRenderedRowContaining(frame, "/model");
    expect(helpRow.indexOf("Show available commands")).toBe(
      modelRow.indexOf("Choose model and reasoning effort"),
    );
  });

  test("renders_highlighted_command_without_selection_marker", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <SlashCommandSelectionPane
        availableSlashCommands={[
          { name: "help", value: "help", description: "Show available commands" },
          { name: "model", value: "model", description: "Choose model and reasoning effort" },
        ]}
        highlightedSlashCommandIndex={1}
        accentColor="#00ff00"
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("/model");
    expect(frame).not.toContain("\u25b6");
  });
});
