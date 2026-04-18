import type { ActivePromptContextQuery } from "./types.ts";

function decodeActivePromptContextQueryText(rawQueryText: string): string {
  if (!rawQueryText.startsWith('"')) {
    return rawQueryText;
  }

  const queryBody = rawQueryText.slice(1);
  let decodedQueryText = "";

  for (let index = 0; index < queryBody.length; index += 1) {
    const currentCharacter = queryBody[index];
    if (currentCharacter === "\\" && index + 1 < queryBody.length) {
      decodedQueryText += queryBody[index + 1];
      index += 1;
      continue;
    }

    if (currentCharacter === '"') {
      break;
    }

    decodedQueryText += currentCharacter;
  }

  return decodedQueryText;
}

function findPromptContextQueryEndOffset(promptDraft: string, promptContextQueryStartOffset: number): number {
  const queryTextStartOffset = promptContextQueryStartOffset + 1;
  if (queryTextStartOffset >= promptDraft.length) {
    return queryTextStartOffset;
  }

  if (promptDraft[queryTextStartOffset] !== '"') {
    let endOffset = queryTextStartOffset;
    while (endOffset < promptDraft.length && !/\s/.test(promptDraft[endOffset] ?? "")) {
      endOffset += 1;
    }
    return endOffset;
  }

  let endOffset = queryTextStartOffset + 1;
  while (endOffset < promptDraft.length) {
    const currentCharacter = promptDraft[endOffset];
    if (currentCharacter === "\\" && endOffset + 1 < promptDraft.length) {
      endOffset += 2;
      continue;
    }

    if (currentCharacter === '"') {
      return endOffset + 1;
    }

    endOffset += 1;
  }

  return promptDraft.length;
}

export function extractActivePromptContextQueryFromPromptDraft(
  promptDraft: string,
  promptDraftCursorOffset: number,
): ActivePromptContextQuery | undefined {
  const normalizedPromptDraftCursorOffset = Math.max(0, Math.min(promptDraftCursorOffset, promptDraft.length));

  for (let index = 0; index < promptDraft.length; index += 1) {
    if (promptDraft[index] !== "@") {
      continue;
    }

    if (index > 0 && !/\s/.test(promptDraft[index - 1] ?? "")) {
      continue;
    }

    const promptContextQueryEndOffset = findPromptContextQueryEndOffset(promptDraft, index);
    if (
      normalizedPromptDraftCursorOffset < index + 1 ||
      normalizedPromptDraftCursorOffset > promptContextQueryEndOffset
    ) {
      if (index > normalizedPromptDraftCursorOffset) {
        break;
      }
      index = Math.max(index, promptContextQueryEndOffset - 1);
      continue;
    }

    const rawQueryText = promptDraft.slice(index + 1, promptContextQueryEndOffset);
    return {
      rawQueryText,
      decodedQueryText: decodeActivePromptContextQueryText(rawQueryText),
      startOffset: index,
      endOffset: promptContextQueryEndOffset,
    };
  }

  return undefined;
}
