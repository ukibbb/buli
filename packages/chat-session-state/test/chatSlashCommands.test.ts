import { expect, test } from "bun:test";
import { buildChatSlashCommands, listChatCommandDefinitions } from "../src/index.ts";

test("listChatCommandDefinitions_exposes_command_metadata_for_help_and_future_palettes", () => {
  const commandDefinitions = listChatCommandDefinitions({
    reasoningSummaryDisplayMode: "expanded",
    availableSkills: [{ name: "code-review", description: "Review code changes" }],
  });

  expect(commandDefinitions.map((commandDefinition) => ({
    category: commandDefinition.category,
    description: commandDefinition.description,
    name: commandDefinition.name,
    value: commandDefinition.value,
  }))).toEqual([
    { category: "help", description: "Show available commands and shortcuts", name: "help", value: "help" },
    { category: "model", description: "Choose OpenAI model and reasoning effort", name: "model", value: "model" },
    { category: "session", description: "Clear conversation history", name: "clear", value: "clear" },
    { category: "session", description: "Summarize old context for this session", name: "compact", value: "compact" },
    { category: "session", description: "Switch or delete saved sessions", name: "sessions", value: "sessions" },
    { category: "session", description: "Export current session as HTML", name: "export-session", value: "export-session" },
    { category: "display", description: "Collapse thinking", name: "thinking", value: "thinking" },
    { category: "skill", description: "Review code changes", name: "code-review", value: "skill:code-review" },
  ]);
});

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

test("buildChatSlashCommands_includes_available_skills_as_slash_commands", () => {
  const slashCommands = buildChatSlashCommands({
    reasoningSummaryDisplayMode: "expanded",
    availableSkills: [
      { name: "code-review", description: "Review code changes" },
      { name: "root-cause-debugging" },
    ],
  });

  expect(slashCommands.slice(-2)).toEqual([
    { name: "code-review", value: "skill:code-review", description: "Review code changes" },
    { name: "root-cause-debugging", value: "skill:root-cause-debugging", description: "Use the root-cause-debugging skill" },
  ]);
});

test("buildChatSlashCommands_keeps_built_in_commands_when_a_skill_name_conflicts", () => {
  const slashCommands = buildChatSlashCommands({
    reasoningSummaryDisplayMode: "expanded",
    availableSkills: [
      { name: "help", description: "Conflicting skill" },
      { name: "code-review", description: "Review code changes" },
    ],
  });

  expect(slashCommands.filter((slashCommand) => slashCommand.name === "help")).toEqual([
    { name: "help", value: "help", description: "Show available commands and shortcuts" },
  ]);
  expect(slashCommands.map((slashCommand) => slashCommand.value)).toContain("skill:code-review");
});
