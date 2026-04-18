import type { ParsedPromptContextReference } from "./types.ts";

const TRAILING_PROMPT_CONTEXT_PUNCTUATION = /[.,!?;:)}\]'"`]+$/;

export function parsePromptContextReferencesFromPromptText(promptText: string): ParsedPromptContextReference[] {
  const parsedPromptContextReferences: ParsedPromptContextReference[] = [];

  for (let index = 0; index < promptText.length; index += 1) {
    if (promptText[index] !== "@") {
      continue;
    }

    if (index > 0 && !/\s/.test(promptText[index - 1] ?? "")) {
      continue;
    }

    const nextCharacter = promptText[index + 1];
    if (!nextCharacter || /\s/.test(nextCharacter)) {
      continue;
    }

    if (nextCharacter === '"') {
      const quotedPromptContextReference = parseQuotedPromptContextReference(promptText, index);
      if (!quotedPromptContextReference) {
        continue;
      }

      parsedPromptContextReferences.push(quotedPromptContextReference.reference);
      index = quotedPromptContextReference.nextIndex;
      continue;
    }

    const unquotedPromptContextReference = parseUnquotedPromptContextReference(promptText, index);
    if (!unquotedPromptContextReference) {
      continue;
    }

    parsedPromptContextReferences.push(unquotedPromptContextReference.reference);
    index = unquotedPromptContextReference.nextIndex;
  }

  return parsedPromptContextReferences;
}

function parseQuotedPromptContextReference(
  promptText: string,
  atSignOffset: number,
): { reference: ParsedPromptContextReference; nextIndex: number } | undefined {
  let decodedDisplayPath = "";

  for (let index = atSignOffset + 2; index < promptText.length; index += 1) {
    const currentCharacter = promptText[index];
    if (currentCharacter === "\\" && index + 1 < promptText.length) {
      decodedDisplayPath += promptText[index + 1];
      index += 1;
      continue;
    }

    if (currentCharacter === '"') {
      if (decodedDisplayPath.length === 0) {
        return undefined;
      }

      return {
        reference: {
          promptReferenceText: promptText.slice(atSignOffset, index + 1),
          displayPath: decodedDisplayPath,
          startOffset: atSignOffset,
          endOffset: index + 1,
        },
        nextIndex: index,
      };
    }

    decodedDisplayPath += currentCharacter;
  }

  return undefined;
}

function parseUnquotedPromptContextReference(
  promptText: string,
  atSignOffset: number,
): { reference: ParsedPromptContextReference; nextIndex: number } | undefined {
  let endOffset = atSignOffset + 1;
  while (endOffset < promptText.length && !/\s/.test(promptText[endOffset] ?? "")) {
    endOffset += 1;
  }

  const rawDisplayPath = promptText.slice(atSignOffset + 1, endOffset);
  const trimmedDisplayPath = rawDisplayPath.replace(TRAILING_PROMPT_CONTEXT_PUNCTUATION, "");
  if (trimmedDisplayPath.length === 0) {
    return undefined;
  }

  const trimmedEndOffset = atSignOffset + 1 + trimmedDisplayPath.length;
  return {
    reference: {
      promptReferenceText: promptText.slice(atSignOffset, trimmedEndOffset),
      displayPath: trimmedDisplayPath,
      startOffset: atSignOffset,
      endOffset: trimmedEndOffset,
    },
    nextIndex: endOffset - 1,
  };
}
