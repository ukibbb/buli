import type { ChatSessionState, SlashCommand } from "./chatSessionState.ts";

function extractActiveSlashCommandQueryText(chatSessionState: ChatSessionState): string | undefined {
  if (!chatSessionState.promptDraft.startsWith("/")) {
    return undefined;
  }

  if (chatSessionState.promptDraftCursorOffset === 0) {
    return undefined;
  }

  const promptDraftBeforeCursor = chatSessionState.promptDraft.slice(0, chatSessionState.promptDraftCursorOffset);
  if (/\s/.test(promptDraftBeforeCursor)) {
    return undefined;
  }

  return promptDraftBeforeCursor.slice(1);
}

function listMatchingSlashCommands(
  slashCommandQueryText: string,
  slashCommands: readonly SlashCommand[],
): readonly SlashCommand[] {
  const normalizedSlashCommandQueryText = slashCommandQueryText.trim().toLowerCase();
  if (!normalizedSlashCommandQueryText) {
    return slashCommands;
  }

  return slashCommands.filter((slashCommand) => {
    return (
      slashCommand.name.toLowerCase().includes(normalizedSlashCommandQueryText) ||
      slashCommand.description.toLowerCase().includes(normalizedSlashCommandQueryText)
    );
  });
}

function resolveHighlightedSlashCommandIndex(input: {
  chatSessionState: ChatSessionState;
  availableSlashCommands: readonly SlashCommand[];
}): number {
  if (input.availableSlashCommands.length === 0) {
    return 0;
  }

  if (input.chatSessionState.slashCommandSelectionState.step !== "showing_slash_commands") {
    return 0;
  }

  const previouslyHighlightedSlashCommand =
    input.chatSessionState.slashCommandSelectionState.availableSlashCommands[
      input.chatSessionState.slashCommandSelectionState.highlightedSlashCommandIndex
    ];
  if (!previouslyHighlightedSlashCommand) {
    return 0;
  }

  const refreshedHighlightedSlashCommandIndex = input.availableSlashCommands.findIndex(
    (slashCommand) => slashCommand.value === previouslyHighlightedSlashCommand.value,
  );
  if (refreshedHighlightedSlashCommandIndex !== -1) {
    return refreshedHighlightedSlashCommandIndex;
  }

  return 0;
}

function doSlashCommandListsMatch(leftSlashCommands: readonly SlashCommand[], rightSlashCommands: readonly SlashCommand[]): boolean {
  return (
    leftSlashCommands.length === rightSlashCommands.length &&
    leftSlashCommands.every((leftSlashCommand, slashCommandIndex) => {
      const rightSlashCommand = rightSlashCommands[slashCommandIndex];
      return (
        rightSlashCommand !== undefined &&
        leftSlashCommand.name === rightSlashCommand.name &&
        leftSlashCommand.value === rightSlashCommand.value &&
        leftSlashCommand.description === rightSlashCommand.description
      );
    })
  );
}

export function refreshSlashCommandSelectionForPromptDraft(
  chatSessionState: ChatSessionState,
  slashCommands: readonly SlashCommand[],
): ChatSessionState {
  const slashCommandQueryText = extractActiveSlashCommandQueryText(chatSessionState);
  if (slashCommandQueryText === undefined) {
    return hideSlashCommandSelection(chatSessionState);
  }

  const availableSlashCommands = listMatchingSlashCommands(slashCommandQueryText, slashCommands);
  if (availableSlashCommands.length === 0) {
    return hideSlashCommandSelection(chatSessionState);
  }

  const highlightedSlashCommandIndex = resolveHighlightedSlashCommandIndex({
    chatSessionState,
    availableSlashCommands,
  });
  if (
    chatSessionState.slashCommandSelectionState.step === "showing_slash_commands" &&
    chatSessionState.slashCommandSelectionState.slashCommandQueryText === slashCommandQueryText &&
    chatSessionState.slashCommandSelectionState.highlightedSlashCommandIndex === highlightedSlashCommandIndex &&
    doSlashCommandListsMatch(chatSessionState.slashCommandSelectionState.availableSlashCommands, availableSlashCommands)
  ) {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    slashCommandSelectionState: {
      step: "showing_slash_commands",
      slashCommandQueryText,
      availableSlashCommands,
      highlightedSlashCommandIndex,
    },
  };
}

export function hideSlashCommandSelection(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.slashCommandSelectionState.step === "hidden") {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    slashCommandSelectionState: { step: "hidden" },
  };
}

export function moveHighlightedSlashCommandSelectionUp(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.slashCommandSelectionState.step !== "showing_slash_commands") {
    return chatSessionState;
  }

  const availableSlashCommandCount = chatSessionState.slashCommandSelectionState.availableSlashCommands.length;
  if (availableSlashCommandCount === 0) {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    slashCommandSelectionState: {
      ...chatSessionState.slashCommandSelectionState,
      highlightedSlashCommandIndex:
        (chatSessionState.slashCommandSelectionState.highlightedSlashCommandIndex - 1 + availableSlashCommandCount) %
        availableSlashCommandCount,
    },
  };
}

export function moveHighlightedSlashCommandSelectionDown(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.slashCommandSelectionState.step !== "showing_slash_commands") {
    return chatSessionState;
  }

  const availableSlashCommandCount = chatSessionState.slashCommandSelectionState.availableSlashCommands.length;
  if (availableSlashCommandCount === 0) {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    slashCommandSelectionState: {
      ...chatSessionState.slashCommandSelectionState,
      highlightedSlashCommandIndex:
        (chatSessionState.slashCommandSelectionState.highlightedSlashCommandIndex + 1) % availableSlashCommandCount,
    },
  };
}

export function selectHighlightedSlashCommand(chatSessionState: ChatSessionState): {
  nextChatSessionState: ChatSessionState;
  selectedSlashCommand: SlashCommand | undefined;
} {
  if (chatSessionState.slashCommandSelectionState.step !== "showing_slash_commands") {
    return { nextChatSessionState: chatSessionState, selectedSlashCommand: undefined };
  }

  const selectedSlashCommand =
    chatSessionState.slashCommandSelectionState.availableSlashCommands[
      chatSessionState.slashCommandSelectionState.highlightedSlashCommandIndex
    ];
  if (!selectedSlashCommand) {
    return { nextChatSessionState: chatSessionState, selectedSlashCommand: undefined };
  }

  return {
    selectedSlashCommand,
    nextChatSessionState: {
      ...chatSessionState,
      promptDraft: "",
      promptDraftCursorOffset: 0,
      pendingPromptTextPastes: [],
      slashCommandSelectionState: { step: "hidden" },
    },
  };
}
