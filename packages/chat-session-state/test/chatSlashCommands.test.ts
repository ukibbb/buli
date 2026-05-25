import { expect, test } from "bun:test";
import { buildChatSlashCommands } from "../src/index.ts";

test("buildChatSlashCommands_describes_current_reasoning_summary_visibility", () => {
  const visibleReasoningSlashCommands = buildChatSlashCommands({
    reasoningSummaryDisplayMode: "expanded",
  });
  const hiddenReasoningSlashCommands = buildChatSlashCommands({
    reasoningSummaryDisplayMode: "collapsed",
  });

  expect(visibleReasoningSlashCommands.find((slashCommand) => slashCommand.value === "thinking")?.description).toBe(
    "Collapse thinking",
  );
  expect(hiddenReasoningSlashCommands.find((slashCommand) => slashCommand.value === "thinking")?.description).toBe(
    "Expand thinking",
  );
});

test("buildChatSlashCommands_includes_manual_compaction", () => {
  const slashCommands = buildChatSlashCommands({
    reasoningSummaryDisplayMode: "expanded",
  });

  expect(slashCommands.find((slashCommand) => slashCommand.value === "compact")?.description).toBe(
    "Summarize old context for this session",
  );
});

test("buildChatSlashCommands_excludes_mode_switching_commands", () => {
  const slashCommands = buildChatSlashCommands({
    reasoningSummaryDisplayMode: "expanded",
  });

  expect(slashCommands.map((slashCommand) => slashCommand.value)).toEqual([
    "help",
    "model",
    "clear",
    "compact",
    "sessions",
    "export-session",
    "thinking",
  ]);
});
