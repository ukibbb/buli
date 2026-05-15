import { describe, expect, test } from "bun:test";
import {
  createInitialChatSessionState,
  insertTextIntoPromptDraftAtCursor,
  moveHighlightedSlashCommandSelectionDown,
  refreshSlashCommandSelectionForPromptDraft,
  selectHighlightedSlashCommand,
  type SlashCommand,
} from "../src/index.ts";

const slashCommands = [
  { name: "help", value: "help", description: "Show available commands" },
  { name: "model", value: "model", description: "Choose model and reasoning effort" },
] as const satisfies readonly SlashCommand[];

describe("slash command selection", () => {
  test("shows_all_commands_when_prompt_draft_is_a_bare_slash", () => {
    const chatSessionState = refreshSlashCommandSelectionForPromptDraft(
      insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "/"),
      slashCommands,
    );

    expect(chatSessionState.slashCommandSelectionState).toEqual({
      step: "showing_slash_commands",
      slashCommandQueryText: "",
      availableSlashCommands: slashCommands,
      highlightedSlashCommandIndex: 0,
    });
  });

  test("filters_commands_by_the_text_after_the_slash", () => {
    const chatSessionState = refreshSlashCommandSelectionForPromptDraft(
      insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "/mo"),
      slashCommands,
    );

    expect(chatSessionState.slashCommandSelectionState).toEqual({
      step: "showing_slash_commands",
      slashCommandQueryText: "mo",
      availableSlashCommands: [slashCommands[1]],
      highlightedSlashCommandIndex: 0,
    });
  });

  test("hides_selection_when_no_commands_match_the_query", () => {
    const chatSessionState = refreshSlashCommandSelectionForPromptDraft(
      insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "/plan"),
      slashCommands,
    );

    expect(chatSessionState.slashCommandSelectionState).toEqual({ step: "hidden" });
  });

  test("hides_selection_after_the_command_token_is_completed_with_whitespace", () => {
    const chatSessionState = refreshSlashCommandSelectionForPromptDraft(
      insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "/model "),
      slashCommands,
    );

    expect(chatSessionState.slashCommandSelectionState).toEqual({ step: "hidden" });
  });

  test("selects_the_highlighted_command_and_clears_the_prompt_draft", () => {
    const chatSessionState = moveHighlightedSlashCommandSelectionDown(
      refreshSlashCommandSelectionForPromptDraft(
        insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "/"),
        slashCommands,
      ),
    );

    const selection = selectHighlightedSlashCommand(chatSessionState);

    expect(selection.selectedSlashCommand).toEqual(slashCommands[1]);
    expect(selection.nextChatSessionState.promptDraft).toBe("");
    expect(selection.nextChatSessionState.promptDraftCursorOffset).toBe(0);
    expect(selection.nextChatSessionState.slashCommandSelectionState).toEqual({ step: "hidden" });
  });
});
