type InternalModeScopeOpeningTag = {
  openingTagText: string;
  closingTagText: string;
};

const INTERNAL_MODE_SCOPE_OPENING_TAGS = [
  { openingTagText: '<understand_mode speaker="user">', closingTagText: "</understand_mode>" },
  { openingTagText: '<understand_mode speaker="assistant">', closingTagText: "</understand_mode>" },
  { openingTagText: '<plan_mode speaker="user">', closingTagText: "</plan_mode>" },
  { openingTagText: '<plan_mode speaker="assistant">', closingTagText: "</plan_mode>" },
  { openingTagText: '<implementation_mode speaker="user">', closingTagText: "</implementation_mode>" },
  { openingTagText: '<implementation_mode speaker="assistant">', closingTagText: "</implementation_mode>" },
] as const satisfies readonly InternalModeScopeOpeningTag[];

const INTERNAL_MODE_SCOPE_CLOSING_TAGS = [
  "</understand_mode>",
  "</plan_mode>",
  "</implementation_mode>",
] as const;

const INTERNAL_MODE_SCOPE_TAG_TEXTS: readonly string[] = [
  ...INTERNAL_MODE_SCOPE_OPENING_TAGS.map((internalModeScopeOpeningTag) => internalModeScopeOpeningTag.openingTagText),
  ...INTERNAL_MODE_SCOPE_CLOSING_TAGS,
];

export function removeInternalModeScopeTagsFromAssistantTranscriptText(assistantTranscriptText: string): string {
  let projectedAssistantTranscriptText = "";
  const expectedClosingTagsForStrippedOpenings: string[] = [];
  let currentCharacterIndex = 0;

  while (currentCharacterIndex < assistantTranscriptText.length) {
    const matchingOpeningTag = findInternalModeScopeOpeningTagAt(assistantTranscriptText, currentCharacterIndex);
    if (matchingOpeningTag) {
      expectedClosingTagsForStrippedOpenings.push(matchingOpeningTag.closingTagText);
      currentCharacterIndex += matchingOpeningTag.openingTagText.length;
      if (assistantTranscriptText[currentCharacterIndex] === "\n") {
        currentCharacterIndex += 1;
      }
      continue;
    }

    const matchingClosingTag = findInternalModeScopeClosingTagAt(assistantTranscriptText, currentCharacterIndex);
    if (
      matchingClosingTag &&
      shouldStripInternalModeScopeClosingTag({
        assistantTranscriptText,
        closingTagText: matchingClosingTag,
        closingTagStartIndex: currentCharacterIndex,
        expectedClosingTagsForStrippedOpenings,
      })
    ) {
      removeExpectedClosingTag(expectedClosingTagsForStrippedOpenings, matchingClosingTag);
      if (projectedAssistantTranscriptText.endsWith("\n")) {
        projectedAssistantTranscriptText = projectedAssistantTranscriptText.slice(0, -1);
      }
      currentCharacterIndex += matchingClosingTag.length;
      continue;
    }

    projectedAssistantTranscriptText += assistantTranscriptText[currentCharacterIndex] ?? "";
    currentCharacterIndex += 1;
  }

  return projectedAssistantTranscriptText;
}

export function readTrailingPossibleInternalModeScopeTagFragment(assistantTranscriptText: string): string {
  let longestTrailingTagFragment = "";

  for (const internalModeScopeTagText of INTERNAL_MODE_SCOPE_TAG_TEXTS) {
    const trailingTagFragment = readLongestTrailingPrefix({
      text: assistantTranscriptText,
      prefixSourceText: internalModeScopeTagText,
      minimumPrefixLength: 1,
    });
    if (trailingTagFragment.length > longestTrailingTagFragment.length) {
      longestTrailingTagFragment = trailingTagFragment;
    }
  }

  for (const internalModeScopeClosingTagText of INTERNAL_MODE_SCOPE_CLOSING_TAGS) {
    const trailingTagFragmentWithLineBreak = readLongestTrailingPrefix({
      text: assistantTranscriptText,
      prefixSourceText: `\n${internalModeScopeClosingTagText}`,
      minimumPrefixLength: 2,
    });
    if (trailingTagFragmentWithLineBreak.length > longestTrailingTagFragment.length) {
      longestTrailingTagFragment = trailingTagFragmentWithLineBreak;
    }
  }

  return longestTrailingTagFragment;
}

function findInternalModeScopeOpeningTagAt(
  assistantTranscriptText: string,
  tagStartIndex: number,
): InternalModeScopeOpeningTag | undefined {
  return INTERNAL_MODE_SCOPE_OPENING_TAGS.find((internalModeScopeOpeningTag) =>
    assistantTranscriptText.startsWith(internalModeScopeOpeningTag.openingTagText, tagStartIndex)
  );
}

function findInternalModeScopeClosingTagAt(assistantTranscriptText: string, tagStartIndex: number): string | undefined {
  return INTERNAL_MODE_SCOPE_CLOSING_TAGS.find((internalModeScopeClosingTag) =>
    assistantTranscriptText.startsWith(internalModeScopeClosingTag, tagStartIndex)
  );
}

function shouldStripInternalModeScopeClosingTag(input: {
  assistantTranscriptText: string;
  closingTagText: string;
  closingTagStartIndex: number;
  expectedClosingTagsForStrippedOpenings: readonly string[];
}): boolean {
  // Closing tags have no speaker attribute, so a standalone line-scoped close
  // is the narrow fallback that catches leaked wrapper endings without removing
  // normal inline XML-like examples such as <plan_mode speaker="critic">...</plan_mode>.
  return input.expectedClosingTagsForStrippedOpenings.includes(input.closingTagText) ||
    isLineScopedInternalModeScopeClosingTag(input);
}

function isLineScopedInternalModeScopeClosingTag(input: {
  assistantTranscriptText: string;
  closingTagText: string;
  closingTagStartIndex: number;
}): boolean {
  const characterBeforeClosingTag = input.assistantTranscriptText[input.closingTagStartIndex - 1];
  const characterAfterClosingTag = input.assistantTranscriptText[
    input.closingTagStartIndex + input.closingTagText.length
  ];
  const isAtLineStart = input.closingTagStartIndex === 0 || characterBeforeClosingTag === "\n";
  const isAtLineEnd = characterAfterClosingTag === undefined || characterAfterClosingTag === "\n";

  return isAtLineStart && isAtLineEnd;
}

function removeExpectedClosingTag(expectedClosingTagsForStrippedOpenings: string[], closingTagText: string): void {
  const matchingClosingTagIndex = expectedClosingTagsForStrippedOpenings.lastIndexOf(closingTagText);
  if (matchingClosingTagIndex !== -1) {
    expectedClosingTagsForStrippedOpenings.splice(matchingClosingTagIndex, 1);
  }
}

function readLongestTrailingPrefix(input: {
  text: string;
  prefixSourceText: string;
  minimumPrefixLength: number;
}): string {
  let longestTrailingPrefix = "";

  for (let prefixLength = input.minimumPrefixLength; prefixLength < input.prefixSourceText.length; prefixLength += 1) {
    const possibleTrailingPrefix = input.prefixSourceText.slice(0, prefixLength);
    if (input.text.endsWith(possibleTrailingPrefix)) {
      longestTrailingPrefix = possibleTrailingPrefix;
    }
  }

  return longestTrailingPrefix;
}
