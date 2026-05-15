import { expect, test } from "bun:test";
import { buildChatSlashCommands } from "../src/index.ts";

test("buildChatSlashCommands_describes_current_reasoning_summary_visibility", () => {
  const visibleReasoningSlashCommands = buildChatSlashCommands({
    isReasoningSummaryVisible: true,
  });
  const hiddenReasoningSlashCommands = buildChatSlashCommands({
    isReasoningSummaryVisible: false,
  });

  expect(visibleReasoningSlashCommands.find((slashCommand) => slashCommand.value === "thinking")?.description).toBe(
    "Hide reasoning summaries",
  );
  expect(hiddenReasoningSlashCommands.find((slashCommand) => slashCommand.value === "thinking")?.description).toBe(
    "Show reasoning summaries",
  );
});

test("buildChatSlashCommands_includes_manual_compaction", () => {
  const slashCommands = buildChatSlashCommands({
    isReasoningSummaryVisible: true,
  });

  expect(slashCommands.find((slashCommand) => slashCommand.value === "compact")?.description).toBe(
    "Summarize old context for this session",
  );
});

test("buildChatSlashCommands_excludes_mode_switching_commands", () => {
  const slashCommands = buildChatSlashCommands({
    isReasoningSummaryVisible: true,
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
