import type { AssistantMarkdownCodeFenceInfo, AssistantMarkdownSourceLineRange } from "./assistantMarkdownTypes.ts";

const codeFenceFileLabelPattern = /(?:^|\s)(?:title|filename|file|path)=("[^"]+"|'[^']+'|[^\s]+)/i;
const codeFenceFileMetadataTokenPattern = /^(?:title|filename|file|path)=/i;
const codeFenceFallbackFileLabelPattern = /(?:^|\s)(\S+\/\S+\.\S+)/;
const codeFenceSourceLabelPattern = /^\S+\/\S+\.\S+$/;
const codeFenceSourceLineRangePattern = /^(.+):(\d+)(?:-(\d+))?$/;

type ParsedAssistantMarkdownCodeFenceSourceLabel = {
  codeFenceFilePath: string;
  sourceLineRange?: AssistantMarkdownSourceLineRange | undefined;
};

export function parseAssistantMarkdownCodeFenceInfo(codeFenceInfoString: string | undefined): AssistantMarkdownCodeFenceInfo {
  const normalizedCodeFenceInfoString = codeFenceInfoString?.trim() ?? "";
  const firstCodeFenceInfoToken = normalizedCodeFenceInfoString.split(/\s+/)[0] || "code";
  const codeLanguageLabel = isAssistantMarkdownCodeFenceSourceLabel(firstCodeFenceInfoToken)
    ? "code"
    : firstCodeFenceInfoToken;
  const codeFenceFileLabel = resolveAssistantMarkdownCodeFenceFileLabel(normalizedCodeFenceInfoString);
  const parsedCodeFenceSourceLabel = codeFenceFileLabel ? parseCodeFenceSourceLabel(codeFenceFileLabel) : undefined;
  return {
    codeLanguageLabel,
    ...(codeFenceFileLabel
      ? {
          codeFenceDisplayLabel: codeFenceFileLabel,
          codeFenceFilePath: parsedCodeFenceSourceLabel?.codeFenceFilePath ?? codeFenceFileLabel,
        }
      : {}),
    ...(parsedCodeFenceSourceLabel?.sourceLineRange ? { sourceLineRange: parsedCodeFenceSourceLabel.sourceLineRange } : {}),
  };
}

export function areAssistantMarkdownCodeFenceInfoValuesEqual(
  previousCodeFenceInfo: AssistantMarkdownCodeFenceInfo,
  nextCodeFenceInfo: AssistantMarkdownCodeFenceInfo,
): boolean {
  return previousCodeFenceInfo.codeLanguageLabel === nextCodeFenceInfo.codeLanguageLabel &&
    previousCodeFenceInfo.codeFenceDisplayLabel === nextCodeFenceInfo.codeFenceDisplayLabel &&
    previousCodeFenceInfo.codeFenceFilePath === nextCodeFenceInfo.codeFenceFilePath &&
    areAssistantMarkdownSourceLineRangesEqual(previousCodeFenceInfo.sourceLineRange, nextCodeFenceInfo.sourceLineRange);
}

function isAssistantMarkdownCodeFenceSourceLabel(codeFenceInfoToken: string): boolean {
  return codeFenceSourceLabelPattern.test(codeFenceInfoToken) || codeFenceFileMetadataTokenPattern.test(codeFenceInfoToken);
}

function resolveAssistantMarkdownCodeFenceFileLabel(codeFenceInfoString: string): string | undefined {
  const explicitCodeFenceFileLabelMatch = codeFenceFileLabelPattern.exec(codeFenceInfoString);
  const explicitCodeFenceFileLabel = explicitCodeFenceFileLabelMatch?.[1];
  if (explicitCodeFenceFileLabel) {
    return explicitCodeFenceFileLabel.replace(/^[']|[']$/g, "").replace(/^"|"$/g, "");
  }

  return codeFenceFallbackFileLabelPattern.exec(codeFenceInfoString)?.[1];
}

function parseCodeFenceSourceLabel(codeFenceFileLabel: string): ParsedAssistantMarkdownCodeFenceSourceLabel {
  const sourceLineRangeMatch = codeFenceSourceLineRangePattern.exec(codeFenceFileLabel);
  const codeFenceFilePath = sourceLineRangeMatch?.[1];
  const sourceStartLineNumberText = sourceLineRangeMatch?.[2];
  if (!codeFenceFilePath || !sourceStartLineNumberText) {
    return { codeFenceFilePath: codeFenceFileLabel };
  }

  const sourceStartLineNumber = Number(sourceStartLineNumberText);
  const sourceEndLineNumber = Number(sourceLineRangeMatch[3] ?? sourceStartLineNumberText);
  if (
    !Number.isInteger(sourceStartLineNumber) ||
    !Number.isInteger(sourceEndLineNumber) ||
    sourceStartLineNumber < 1 ||
    sourceEndLineNumber < sourceStartLineNumber
  ) {
    return { codeFenceFilePath: codeFenceFileLabel };
  }

  return {
    codeFenceFilePath,
    sourceLineRange: { sourceStartLineNumber, sourceEndLineNumber },
  };
}

function areAssistantMarkdownSourceLineRangesEqual(
  previousSourceLineRange: AssistantMarkdownSourceLineRange | undefined,
  nextSourceLineRange: AssistantMarkdownSourceLineRange | undefined,
): boolean {
  return previousSourceLineRange?.sourceStartLineNumber === nextSourceLineRange?.sourceStartLineNumber &&
    previousSourceLineRange?.sourceEndLineNumber === nextSourceLineRange?.sourceEndLineNumber;
}
