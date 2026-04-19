import {
  extractActivePromptContextQueryFromPromptDraft,
  reconcileSelectedPromptContextReferenceTextsWithPromptDraft,
  replaceActivePromptContextQueryWithSelectedReference,
  type PromptContextCandidate,
} from "@buli/engine";
import type { ChatSessionState } from "./chatSessionState.ts";

function findHighlightedPromptContextCandidateIndexAfterRefresh(input: {
  previousPromptContextCandidates: readonly PromptContextCandidate[];
  refreshedPromptContextCandidates: readonly PromptContextCandidate[];
  previousHighlightedPromptContextCandidateIndex: number;
}): number {
  const previouslyHighlightedPromptContextCandidate =
    input.previousPromptContextCandidates[input.previousHighlightedPromptContextCandidateIndex];
  if (previouslyHighlightedPromptContextCandidate) {
    const refreshedHighlightedPromptContextCandidateIndex = input.refreshedPromptContextCandidates.findIndex(
      (promptContextCandidate) =>
        promptContextCandidate.promptReferenceText === previouslyHighlightedPromptContextCandidate.promptReferenceText,
    );
    if (refreshedHighlightedPromptContextCandidateIndex !== -1) {
      return refreshedHighlightedPromptContextCandidateIndex;
    }
  }

  return Math.max(
    0,
    Math.min(
      input.previousHighlightedPromptContextCandidateIndex,
      input.refreshedPromptContextCandidates.length - 1,
    ),
  );
}

export function showPromptContextCandidatesForSelection(
  chatSessionState: ChatSessionState,
  promptContextQueryText: string,
  promptContextCandidates: readonly PromptContextCandidate[],
): ChatSessionState {
  return {
    ...chatSessionState,
    promptContextSelectionState: {
      step: "showing_prompt_context_candidates",
      promptContextQueryText,
      promptContextCandidates,
      highlightedPromptContextCandidateIndex: 0,
    },
  };
}

export function refreshPromptContextCandidatesForSelection(
  chatSessionState: ChatSessionState,
  promptContextQueryText: string,
  promptContextCandidates: readonly PromptContextCandidate[],
): ChatSessionState {
  if (chatSessionState.promptContextSelectionState.step !== "showing_prompt_context_candidates") {
    return showPromptContextCandidatesForSelection(chatSessionState, promptContextQueryText, promptContextCandidates);
  }

  return {
    ...chatSessionState,
    promptContextSelectionState: {
      ...chatSessionState.promptContextSelectionState,
      promptContextQueryText,
      promptContextCandidates,
      highlightedPromptContextCandidateIndex: findHighlightedPromptContextCandidateIndexAfterRefresh({
        previousPromptContextCandidates: chatSessionState.promptContextSelectionState.promptContextCandidates,
        refreshedPromptContextCandidates: promptContextCandidates,
        previousHighlightedPromptContextCandidateIndex:
          chatSessionState.promptContextSelectionState.highlightedPromptContextCandidateIndex,
      }),
    },
  };
}

export function hidePromptContextSelection(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.promptContextSelectionState.step === "hidden") {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    promptContextSelectionState: { step: "hidden" },
  };
}

export function moveHighlightedPromptContextCandidateUp(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.promptContextSelectionState.step !== "showing_prompt_context_candidates") {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    promptContextSelectionState: {
      ...chatSessionState.promptContextSelectionState,
      highlightedPromptContextCandidateIndex: Math.max(
        0,
        chatSessionState.promptContextSelectionState.highlightedPromptContextCandidateIndex - 1,
      ),
    },
  };
}

export function moveHighlightedPromptContextCandidateDown(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.promptContextSelectionState.step !== "showing_prompt_context_candidates") {
    return chatSessionState;
  }

  if (chatSessionState.promptContextSelectionState.promptContextCandidates.length === 0) {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    promptContextSelectionState: {
      ...chatSessionState.promptContextSelectionState,
      highlightedPromptContextCandidateIndex: Math.min(
        chatSessionState.promptContextSelectionState.promptContextCandidates.length - 1,
        chatSessionState.promptContextSelectionState.highlightedPromptContextCandidateIndex + 1,
      ),
    },
  };
}

export function selectHighlightedPromptContextCandidate(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.promptContextSelectionState.step !== "showing_prompt_context_candidates") {
    return chatSessionState;
  }

  const selectedPromptContextCandidate = chatSessionState.promptContextSelectionState.promptContextCandidates[
    chatSessionState.promptContextSelectionState.highlightedPromptContextCandidateIndex
  ];
  if (!selectedPromptContextCandidate) {
    return chatSessionState;
  }

  const activePromptContextQuery = extractActivePromptContextQueryFromPromptDraft(
    chatSessionState.promptDraft,
    chatSessionState.promptDraftCursorOffset,
  );
  if (!activePromptContextQuery) {
    return chatSessionState;
  }

  const replacedPromptContextQuery = replaceActivePromptContextQueryWithSelectedReference({
    promptDraft: chatSessionState.promptDraft,
    activePromptContextQuery,
    selectedPromptContextReferenceText: selectedPromptContextCandidate.promptReferenceText,
  });
  const promptDraft =
    activePromptContextQuery.endOffset === chatSessionState.promptDraft.length && !replacedPromptContextQuery.endsWith(" ")
      ? `${replacedPromptContextQuery} `
      : replacedPromptContextQuery;
  let promptDraftCursorOffset = activePromptContextQuery.startOffset + selectedPromptContextCandidate.promptReferenceText.length;
  if (activePromptContextQuery.endOffset === chatSessionState.promptDraft.length && !replacedPromptContextQuery.endsWith(" ")) {
    promptDraftCursorOffset += 1;
  } else if (/\s/.test(promptDraft[promptDraftCursorOffset] ?? "")) {
    promptDraftCursorOffset += 1;
  }

  return {
    ...chatSessionState,
    promptDraft,
    promptDraftCursorOffset,
    promptContextSelectionState: { step: "hidden" },
    selectedPromptContextReferenceTexts: reconcileSelectedPromptContextReferenceTextsWithPromptDraft({
      promptDraft,
      selectedPromptContextReferenceTexts: [
        ...chatSessionState.selectedPromptContextReferenceTexts,
        selectedPromptContextCandidate.promptReferenceText,
      ],
    }),
  };
}
