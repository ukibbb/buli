import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { SlashCommandSelectionPane } from "../../src/components/SlashCommandSelectionPane.tsx";

describe("SlashCommandSelectionPane", () => {
  test("renders_commands_with_descriptions", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <SlashCommandSelectionPane
        availableSlashCommands={[
          { name: "help", value: "help", description: "Show available commands" },
          { name: "model", value: "model", description: "Choose model and reasoning effort" },
        ]}
        highlightedSlashCommandIndex={0}
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Commands");
    expect(frame).toContain("/help");
    expect(frame).toContain("Show available commands");
    expect(frame).toContain("/model");
    expect(frame).toContain("Choose model and reasoning effort");
  });

  test("renders_selection_marker_on_highlighted_command", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <SlashCommandSelectionPane
        availableSlashCommands={[
          { name: "help", value: "help", description: "Show available commands" },
          { name: "model", value: "model", description: "Choose model and reasoning effort" },
        ]}
        highlightedSlashCommandIndex={1}
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    expect(captureCharFrame()).toContain("> /model");
  });
});
