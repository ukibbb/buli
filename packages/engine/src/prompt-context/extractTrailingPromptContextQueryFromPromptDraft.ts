import type { TrailingPromptContextQuery } from "./types.ts";

function decodeTrailingPromptContextQueryText(rawQueryText: string): string {
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

export function extractTrailingPromptContextQueryFromPromptDraft(
  promptDraft: string,
): TrailingPromptContextQuery | undefined {
  if (promptDraft.length === 0) {
    return undefined;
  }

  for (let index = promptDraft.length - 1; index >= 0; index -= 1) {
    if (promptDraft[index] !== "@") {
      continue;
    }

    if (index > 0 && !/\s/.test(promptDraft[index - 1] ?? "")) {
      continue;
    }

    const rawQueryText = promptDraft.slice(index + 1);
    if (rawQueryText.length === 0) {
      return undefined;
    }

    if (!rawQueryText.startsWith('"') && /\s/.test(rawQueryText)) {
      return undefined;
    }

    return {
      rawQueryText,
      decodedQueryText: decodeTrailingPromptContextQueryText(rawQueryText),
      startOffset: index,
      endOffset: promptDraft.length,
    };
  }

  return undefined;
}
