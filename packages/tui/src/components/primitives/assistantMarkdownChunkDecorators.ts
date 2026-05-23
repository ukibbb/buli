import {
  createTextAttributes,
  RGBA,
  type ChunkRenderContext,
  type TextChunk,
} from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import {
  assistantMarkdownDiffAdditionForegroundColor,
  assistantMarkdownDiffChromeForegroundColor,
  assistantMarkdownDiffMetadataForegroundColor,
  assistantMarkdownDiffRemovalForegroundColor,
  assistantMarkdownInlineCodeForegroundColor,
  assistantMarkdownStrongForegroundColor,
} from "./codeRenderingTheme.ts";

type AssistantMarkdownTextChunkStyle = {
  fg: RGBA;
  attributes?: number;
};

export type AssistantMarkdownInlineDecorationProfile = "prose" | "list" | "diff";

type AssistantMarkdownInlineDecorationRule = (textChunk: TextChunk) => TextChunk[];

const filePathForegroundColor = RGBA.fromHex(chatScreenTheme.accentCyan);
const filePathTextAttributes = createTextAttributes({ underline: true });
const shellCommandForegroundColor = RGBA.fromHex(chatScreenTheme.accentGreen);
const shellCommandTextAttributes = createTextAttributes({ bold: true });
const inlineCodeForegroundColor = assistantMarkdownInlineCodeForegroundColor;
const inlineCodeTextAttributes = createTextAttributes({ bold: true });
const strongForegroundColor = assistantMarkdownStrongForegroundColor;
const strongTextAttributes = createTextAttributes({ bold: true });
const listMarkerTextAttributes = createTextAttributes({ bold: true });
const diffMetadataTextAttributes = createTextAttributes({ bold: true });
const diffAdditionForegroundColor = assistantMarkdownDiffAdditionForegroundColor;
const diffRemovalForegroundColor = assistantMarkdownDiffRemovalForegroundColor;
const diffMetadataForegroundColor = assistantMarkdownDiffMetadataForegroundColor;
const diffChromeForegroundColor = assistantMarkdownDiffChromeForegroundColor;
const diagnosticErrorForegroundColor = RGBA.fromHex(chatScreenTheme.accentRed);
const diagnosticWarningForegroundColor = RGBA.fromHex(chatScreenTheme.accentAmber);
const diagnosticInfoForegroundColor = RGBA.fromHex(chatScreenTheme.accentCyan);
const diagnosticCodeForegroundColor = RGBA.fromHex(chatScreenTheme.accentPurple);
const diagnosticTokenTextAttributes = createTextAttributes({ bold: true });

const unorderedListMarkers = ["-"] as const;
const unorderedListMarkerForegroundColors = [
  RGBA.fromHex(chatScreenTheme.accentPrimaryMuted),
  RGBA.fromHex(chatScreenTheme.accentCyan),
  RGBA.fromHex(chatScreenTheme.accentAmber),
  RGBA.fromHex(chatScreenTheme.accentPurple),
] as const;

const filePathReferenceSource = String.raw`(?:\.{1,2}\/|~\/|[A-Za-z0-9_-]+\/)(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:bash|cjs|css|gif|go|html|java|jpeg|jpg|js|json|jsx|kt|lock|md|mdx|mjs|php|png|py|rb|rs|scss|sh|sql|svg|swift|toml|ts|tsx|txt|webp|xml|yaml|yml|zsh)(?::\d+(?::\d+)?)?`;
const filePathReferencePattern = new RegExp(
  String.raw`(^|[\s([{\"'\`])(${filePathReferenceSource})(?=$|[\s)\]},.;:'"\`!?])`,
  "g",
);
const diagnosticReferencePattern = new RegExp(
  String.raw`(^|[\s([{\"'\`])(${filePathReferenceSource})(\s+)(error|warning|warn|info|note)(\s+)([A-Z]+\d+)`,
  "gi",
);
const shellCommandPattern = /(^|[\s({["'`])((?:bun|npm|pnpm|yarn)\s+(?:(?:run\s+)?[A-Za-z0-9:_-]+)(?:\s+--?[A-Za-z0-9:._=/-]+)*|git\s+(?:status|diff|log|show|add|commit|push|pull|checkout|switch|branch|restore|merge|rebase)(?:\s+--?[A-Za-z0-9:._=/-]+)*|gh\s+(?:pr|issue|repo|api|workflow|run|release)\s+[A-Za-z0-9:_-]+(?:\s+--?[A-Za-z0-9:._=/-]+)*)(?=$|[\s)\]},.;:'"`!?])/g;
const listMarkerPattern = /(^|\n)(\s*)((?:☑|☐|-|[•◦▪▫]|\d+\.))(?=\s)/g;
const inlineCodeSpanPattern = /`([^`\n]+)`/g;
const strongAsteriskSpanPattern = /\*\*([^*\n]+)\*\*/g;
const strongUnderscoreSpanPattern = /__([^_\n]+)__/g;

function cloneTextChunkWithText(textChunk: TextChunk, text: string): TextChunk {
  return { ...textChunk, text };
}

function styleTextChunk(
  textChunk: TextChunk,
  text: string,
  style: AssistantMarkdownTextChunkStyle,
): TextChunk {
  const styledTextChunk: TextChunk = {
    ...textChunk,
    text,
    fg: style.fg,
  };
  if (style.attributes !== undefined) {
    styledTextChunk.attributes = style.attributes;
  }
  return styledTextChunk;
}

function pushPlainTextBeforeMatch(input: {
  outputTextChunks: TextChunk[];
  sourceTextChunk: TextChunk;
  plainTextStartIndex: number;
  styledTextStartIndex: number;
}): void {
  if (input.styledTextStartIndex <= input.plainTextStartIndex) {
    return;
  }

  input.outputTextChunks.push(
    cloneTextChunkWithText(
      input.sourceTextChunk,
      input.sourceTextChunk.text.slice(input.plainTextStartIndex, input.styledTextStartIndex),
    ),
  );
}

function pushRemainingPlainText(input: {
  outputTextChunks: TextChunk[];
  sourceTextChunk: TextChunk;
  plainTextStartIndex: number;
}): void {
  if (input.plainTextStartIndex >= input.sourceTextChunk.text.length) {
    return;
  }

  input.outputTextChunks.push(
    cloneTextChunkWithText(input.sourceTextChunk, input.sourceTextChunk.text.slice(input.plainTextStartIndex)),
  );
}

function splitTextChunkByFilePathReferences(textChunk: TextChunk): TextChunk[] {
  const textChunks: TextChunk[] = [];
  let nextPlainTextStartIndex = 0;

  for (const filePathReferenceMatch of textChunk.text.matchAll(filePathReferencePattern)) {
    const filePathPrefix = filePathReferenceMatch[1] ?? "";
    const filePathReference = filePathReferenceMatch[2] ?? "";
    const matchStartIndex = filePathReferenceMatch.index;
    if (matchStartIndex === undefined || filePathReference.length === 0) {
      continue;
    }

    const filePathStartIndex = matchStartIndex + filePathPrefix.length;
    pushPlainTextBeforeMatch({
      outputTextChunks: textChunks,
      sourceTextChunk: textChunk,
      plainTextStartIndex: nextPlainTextStartIndex,
      styledTextStartIndex: filePathStartIndex,
    });
    textChunks.push(
      styleTextChunk(textChunk, filePathReference, {
        fg: filePathForegroundColor,
        attributes: filePathTextAttributes,
      }),
    );
    nextPlainTextStartIndex = filePathStartIndex + filePathReference.length;
  }

  if (textChunks.length === 0) {
    return [textChunk];
  }

  pushRemainingPlainText({
    outputTextChunks: textChunks,
    sourceTextChunk: textChunk,
    plainTextStartIndex: nextPlainTextStartIndex,
  });
  return textChunks;
}

function splitTextChunkByShellCommands(textChunk: TextChunk): TextChunk[] {
  const textChunks: TextChunk[] = [];
  let nextPlainTextStartIndex = 0;

  for (const shellCommandMatch of textChunk.text.matchAll(shellCommandPattern)) {
    const shellCommandPrefix = shellCommandMatch[1] ?? "";
    const shellCommandText = shellCommandMatch[2] ?? "";
    const matchStartIndex = shellCommandMatch.index;
    if (matchStartIndex === undefined || shellCommandText.length === 0) {
      continue;
    }

    const shellCommandStartIndex = matchStartIndex + shellCommandPrefix.length;
    pushPlainTextBeforeMatch({
      outputTextChunks: textChunks,
      sourceTextChunk: textChunk,
      plainTextStartIndex: nextPlainTextStartIndex,
      styledTextStartIndex: shellCommandStartIndex,
    });
    textChunks.push(
      styleTextChunk(textChunk, shellCommandText, {
        fg: shellCommandForegroundColor,
        attributes: shellCommandTextAttributes,
      }),
    );
    nextPlainTextStartIndex = shellCommandStartIndex + shellCommandText.length;
  }

  if (textChunks.length === 0) {
    return [textChunk];
  }

  pushRemainingPlainText({
    outputTextChunks: textChunks,
    sourceTextChunk: textChunk,
    plainTextStartIndex: nextPlainTextStartIndex,
  });
  return textChunks;
}

function isInlineCodeTextChunk(textChunk: TextChunk): boolean {
  return textChunk.fg === inlineCodeForegroundColor && textChunk.attributes === inlineCodeTextAttributes;
}

function splitTextChunkByInlineMarkdownPattern(
  textChunk: TextChunk,
  inlineMarkdownPattern: RegExp,
  style: AssistantMarkdownTextChunkStyle,
): TextChunk[] {
  if (isInlineCodeTextChunk(textChunk)) {
    return [textChunk];
  }

  const textChunks: TextChunk[] = [];
  let nextPlainTextStartIndex = 0;

  for (const inlineMarkdownMatch of textChunk.text.matchAll(inlineMarkdownPattern)) {
    const visibleInlineText = inlineMarkdownMatch[1] ?? "";
    const matchStartIndex = inlineMarkdownMatch.index;
    if (matchStartIndex === undefined || visibleInlineText.length === 0) {
      continue;
    }

    pushPlainTextBeforeMatch({
      outputTextChunks: textChunks,
      sourceTextChunk: textChunk,
      plainTextStartIndex: nextPlainTextStartIndex,
      styledTextStartIndex: matchStartIndex,
    });
    textChunks.push(styleTextChunk(textChunk, visibleInlineText, style));
    nextPlainTextStartIndex = matchStartIndex + inlineMarkdownMatch[0].length;
  }

  if (textChunks.length === 0) {
    return [textChunk];
  }

  pushRemainingPlainText({
    outputTextChunks: textChunks,
    sourceTextChunk: textChunk,
    plainTextStartIndex: nextPlainTextStartIndex,
  });
  return textChunks;
}

function splitTextChunkByInlineCodeSpans(textChunk: TextChunk): TextChunk[] {
  return splitTextChunkByInlineMarkdownPattern(textChunk, inlineCodeSpanPattern, {
    fg: inlineCodeForegroundColor,
    attributes: inlineCodeTextAttributes,
  });
}

function splitTextChunkByStrongAsteriskSpans(textChunk: TextChunk): TextChunk[] {
  return splitTextChunkByInlineMarkdownPattern(textChunk, strongAsteriskSpanPattern, {
    fg: strongForegroundColor,
    attributes: strongTextAttributes,
  });
}

function splitTextChunkByStrongUnderscoreSpans(textChunk: TextChunk): TextChunk[] {
  return splitTextChunkByInlineMarkdownPattern(textChunk, strongUnderscoreSpanPattern, {
    fg: strongForegroundColor,
    attributes: strongTextAttributes,
  });
}

function resolveDiagnosticSeverityStyle(diagnosticSeverityText: string): AssistantMarkdownTextChunkStyle {
  const normalizedDiagnosticSeverityText = diagnosticSeverityText.toLowerCase();
  if (normalizedDiagnosticSeverityText === "error") {
    return { fg: diagnosticErrorForegroundColor, attributes: diagnosticTokenTextAttributes };
  }

  if (normalizedDiagnosticSeverityText === "warning" || normalizedDiagnosticSeverityText === "warn") {
    return { fg: diagnosticWarningForegroundColor, attributes: diagnosticTokenTextAttributes };
  }

  return { fg: diagnosticInfoForegroundColor, attributes: diagnosticTokenTextAttributes };
}

function splitTextChunkByDiagnostics(textChunk: TextChunk): TextChunk[] {
  const textChunks: TextChunk[] = [];
  let nextPlainTextStartIndex = 0;

  for (const diagnosticMatch of textChunk.text.matchAll(diagnosticReferencePattern)) {
    const diagnosticPrefix = diagnosticMatch[1] ?? "";
    const diagnosticFilePath = diagnosticMatch[2] ?? "";
    const diagnosticFilePathSeparator = diagnosticMatch[3] ?? "";
    const diagnosticSeverityText = diagnosticMatch[4] ?? "";
    const diagnosticSeveritySeparator = diagnosticMatch[5] ?? "";
    const diagnosticCodeText = diagnosticMatch[6] ?? "";
    const matchStartIndex = diagnosticMatch.index;
    if (
      matchStartIndex === undefined ||
      diagnosticFilePath.length === 0 ||
      diagnosticSeverityText.length === 0 ||
      diagnosticCodeText.length === 0
    ) {
      continue;
    }

    const diagnosticFilePathStartIndex = matchStartIndex + diagnosticPrefix.length;
    pushPlainTextBeforeMatch({
      outputTextChunks: textChunks,
      sourceTextChunk: textChunk,
      plainTextStartIndex: nextPlainTextStartIndex,
      styledTextStartIndex: diagnosticFilePathStartIndex,
    });
    textChunks.push(
      styleTextChunk(textChunk, diagnosticFilePath, {
        fg: filePathForegroundColor,
        attributes: filePathTextAttributes,
      }),
    );
    textChunks.push(cloneTextChunkWithText(textChunk, diagnosticFilePathSeparator));
    textChunks.push(styleTextChunk(textChunk, diagnosticSeverityText, resolveDiagnosticSeverityStyle(diagnosticSeverityText)));
    textChunks.push(cloneTextChunkWithText(textChunk, diagnosticSeveritySeparator));
    textChunks.push(
      styleTextChunk(textChunk, diagnosticCodeText, {
        fg: diagnosticCodeForegroundColor,
        attributes: diagnosticTokenTextAttributes,
      }),
    );

    nextPlainTextStartIndex =
      diagnosticFilePathStartIndex +
      diagnosticFilePath.length +
      diagnosticFilePathSeparator.length +
      diagnosticSeverityText.length +
      diagnosticSeveritySeparator.length +
      diagnosticCodeText.length;
  }

  if (textChunks.length === 0) {
    return [textChunk];
  }

  pushRemainingPlainText({
    outputTextChunks: textChunks,
    sourceTextChunk: textChunk,
    plainTextStartIndex: nextPlainTextStartIndex,
  });
  return textChunks;
}

function resolveListMarkerForegroundColor(listMarker: string): RGBA {
  if (listMarker === "☑") {
    return RGBA.fromHex(chatScreenTheme.accentGreen);
  }

  if (listMarker === "☐") {
    return RGBA.fromHex(chatScreenTheme.textDim);
  }

  if (/^\d+\.$/.test(listMarker)) {
    return RGBA.fromHex(chatScreenTheme.accentAmber);
  }

  const unorderedListMarkerIndex = unorderedListMarkers.indexOf(
    listMarker as (typeof unorderedListMarkers)[number],
  );
  return unorderedListMarkerForegroundColors[unorderedListMarkerIndex] ?? RGBA.fromHex(chatScreenTheme.textMuted);
}

function splitTextChunkByListMarkers(textChunk: TextChunk): TextChunk[] {
  const textChunks: TextChunk[] = [];
  let nextPlainTextStartIndex = 0;

  for (const listMarkerMatch of textChunk.text.matchAll(listMarkerPattern)) {
    const linePrefix = listMarkerMatch[1] ?? "";
    const listMarkerIndent = listMarkerMatch[2] ?? "";
    const listMarker = listMarkerMatch[3] ?? "";
    const matchStartIndex = listMarkerMatch.index;
    if (matchStartIndex === undefined || listMarker.length === 0) {
      continue;
    }

    const listMarkerStartIndex = matchStartIndex + linePrefix.length + listMarkerIndent.length;
    pushPlainTextBeforeMatch({
      outputTextChunks: textChunks,
      sourceTextChunk: textChunk,
      plainTextStartIndex: nextPlainTextStartIndex,
      styledTextStartIndex: listMarkerStartIndex,
    });
    textChunks.push(
      styleTextChunk(textChunk, listMarker, {
        fg: resolveListMarkerForegroundColor(listMarker),
        attributes: listMarkerTextAttributes,
      }),
    );
    nextPlainTextStartIndex = listMarkerStartIndex + listMarker.length;
  }

  if (textChunks.length === 0) {
    return [textChunk];
  }

  pushRemainingPlainText({
    outputTextChunks: textChunks,
    sourceTextChunk: textChunk,
    plainTextStartIndex: nextPlainTextStartIndex,
  });
  return textChunks;
}

function resolveDiffLineStyle(diffLineText: string): AssistantMarkdownTextChunkStyle | undefined {
  const trimmedDiffLineText = diffLineText.trimStart();
  if (trimmedDiffLineText.startsWith("╭") || trimmedDiffLineText.startsWith("╰")) {
    return { fg: diffChromeForegroundColor };
  }

  if (
    trimmedDiffLineText.startsWith("│ @@") ||
    trimmedDiffLineText.startsWith("│ diff --git") ||
    trimmedDiffLineText.startsWith("│ ---") ||
    trimmedDiffLineText.startsWith("│ +++")
  ) {
    return {
      fg: diffMetadataForegroundColor,
      attributes: diffMetadataTextAttributes,
    };
  }

  if (trimmedDiffLineText.startsWith("│ +")) {
    return { fg: diffAdditionForegroundColor };
  }

  if (trimmedDiffLineText.startsWith("│ -")) {
    return { fg: diffRemovalForegroundColor };
  }

  return undefined;
}

function splitTextChunkByDiffLines(textChunk: TextChunk): TextChunk[] {
  const textChunks: TextChunk[] = [];
  let currentLineStartIndex = 0;

  while (currentLineStartIndex < textChunk.text.length) {
    const nextLineBreakIndex = textChunk.text.indexOf("\n", currentLineStartIndex);
    const currentLineEndIndex = nextLineBreakIndex === -1 ? textChunk.text.length : nextLineBreakIndex;
    const currentLineText = textChunk.text.slice(currentLineStartIndex, currentLineEndIndex);
    const currentLineStyle = resolveDiffLineStyle(currentLineText);

    if (currentLineText.length > 0) {
      textChunks.push(
        currentLineStyle
          ? styleTextChunk(textChunk, currentLineText, currentLineStyle)
          : cloneTextChunkWithText(textChunk, currentLineText),
      );
    }

    if (nextLineBreakIndex !== -1) {
      textChunks.push(cloneTextChunkWithText(textChunk, "\n"));
      currentLineStartIndex = nextLineBreakIndex + 1;
    } else {
      currentLineStartIndex = textChunk.text.length;
    }
  }

  return textChunks.length > 0 ? textChunks : [textChunk];
}

const assistantMarkdownReferenceInlineDecorationRules: readonly AssistantMarkdownInlineDecorationRule[] = [
  splitTextChunkByDiagnostics,
  splitTextChunkByShellCommands,
  splitTextChunkByFilePathReferences,
];

const assistantMarkdownProseInlineDecorationRules: readonly AssistantMarkdownInlineDecorationRule[] = [
  splitTextChunkByInlineCodeSpans,
  splitTextChunkByStrongAsteriskSpans,
  splitTextChunkByStrongUnderscoreSpans,
  ...assistantMarkdownReferenceInlineDecorationRules,
];

const assistantMarkdownListInlineDecorationRules: readonly AssistantMarkdownInlineDecorationRule[] = [
  splitTextChunkByListMarkers,
  ...assistantMarkdownProseInlineDecorationRules,
];

const assistantMarkdownDiffInlineDecorationRules: readonly AssistantMarkdownInlineDecorationRule[] = [
  splitTextChunkByDiffLines,
  ...assistantMarkdownReferenceInlineDecorationRules,
];

function applyAssistantMarkdownInlineDecorationRules(input: {
  textChunks: TextChunk[];
  rules: readonly AssistantMarkdownInlineDecorationRule[];
}): TextChunk[] {
  return input.rules.reduce(
    (decoratedTextChunks, decorationRule) => decoratedTextChunks.flatMap(decorationRule),
    Array.from(input.textChunks),
  );
}

function resolveAssistantMarkdownInlineDecorationRules(
  profile: AssistantMarkdownInlineDecorationProfile,
): readonly AssistantMarkdownInlineDecorationRule[] {
  if (profile === "list") {
    return assistantMarkdownListInlineDecorationRules;
  }
  if (profile === "diff") {
    return assistantMarkdownDiffInlineDecorationRules;
  }

  return assistantMarkdownProseInlineDecorationRules;
}

export function decorateAssistantMarkdownInlineTextChunks(input: {
  textChunks: TextChunk[];
  profile: AssistantMarkdownInlineDecorationProfile;
}): TextChunk[] {
  return applyAssistantMarkdownInlineDecorationRules({
    textChunks: input.textChunks,
    rules: resolveAssistantMarkdownInlineDecorationRules(input.profile),
  });
}

export function decorateAssistantMarkdownProseTextChunks(textChunks: TextChunk[]): TextChunk[] {
  return decorateAssistantMarkdownInlineTextChunks({ textChunks, profile: "prose" });
}

export function decorateAssistantMarkdownListTextChunks(textChunks: TextChunk[]): TextChunk[] {
  return decorateAssistantMarkdownInlineTextChunks({ textChunks, profile: "list" });
}

export function decorateAssistantMarkdownDiffFenceTextChunks(textChunks: TextChunk[]): TextChunk[] {
  return decorateAssistantMarkdownInlineTextChunks({ textChunks, profile: "diff" });
}

export function decorateAssistantMarkdownProseChunks(
  textChunks: TextChunk[],
  _context: ChunkRenderContext,
): TextChunk[] {
  return decorateAssistantMarkdownProseTextChunks(textChunks);
}

export function decorateAssistantMarkdownListChunks(
  textChunks: TextChunk[],
  _context: ChunkRenderContext,
): TextChunk[] {
  return decorateAssistantMarkdownListTextChunks(textChunks);
}

export function decorateAssistantMarkdownDiffFenceChunks(
  textChunks: TextChunk[],
  _context: ChunkRenderContext,
): TextChunk[] {
  return decorateAssistantMarkdownDiffFenceTextChunks(textChunks);
}
