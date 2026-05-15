import { expect, test } from "bun:test";
import { buildChatSlashCommands } from "../src/index.ts";

test("buildChatSlashCommands_describes_current_reasoning_summary_visibility", () => {
  const visibleReasoningSlashCommands = buildChatSlashCommands({
    isReasoningSummaryVisible: true,
    selectedAssistantOperatingMode: "implementation",
  });
  const hiddenReasoningSlashCommands = buildChatSlashCommands({
    isReasoningSummaryVisible: false,
    selectedAssistantOperatingMode: "implementation",
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
    selectedAssistantOperatingMode: "implementation",
  });

  expect(slashCommands.find((slashCommand) => slashCommand.value === "compact")?.description).toBe(
    "Summarize old context for this session",
  );
});

test("buildChatSlashCommands_describes_current_assistant_operating_mode", () => {
  const understandModeSlashCommands = buildChatSlashCommands({
    isReasoningSummaryVisible: true,
    selectedAssistantOperatingMode: "understand",
  });
  const planModeSlashCommands = buildChatSlashCommands({
    isReasoningSummaryVisible: true,
    selectedAssistantOperatingMode: "plan",
  });
  const implementationModeSlashCommands = buildChatSlashCommands({
    isReasoningSummaryVisible: true,
    selectedAssistantOperatingMode: "implementation",
  });

  expect(understandModeSlashCommands.find((slashCommand) => slashCommand.value === "understand")?.description).toBe(
    "Understand mode is active",
  );
  expect(planModeSlashCommands.find((slashCommand) => slashCommand.value === "plan")?.description).toBe(
    "Plan mode is active",
  );
  expect(implementationModeSlashCommands.find((slashCommand) => slashCommand.value === "implementation")?.description).toBe(
    "Implementation mode is active",
  );
});
