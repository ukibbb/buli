const genericConversationExportCodeFenceLanguageLabels = new Set(["code", "plain", "plaintext", "text", "txt"]);
const codeFenceFileLabelPattern = /(?:^|\s)(?:title|filename|file|path)=("[^"]+"|'[^']+'|[^\s]+)/i;
const codeFenceFileMetadataTokenPattern = /^(?:title|filename|file|path)=/i;
const codeFenceFallbackFileLabelPattern = /(?:^|\s)(\S+\/\S+\.\S+)/;
const codeFenceSourceLabelPattern = /^\S+\/\S+\.\S+$/;
const codeFenceSourceLineRangePattern = /^(.+):(\d+)(?:-(\d+))?$/;

export type ConversationExportSourceLineRange = {
  sourceStartLineNumber: number;
  sourceEndLineNumber: number;
};

export type ConversationExportCodeFenceInfo = {
  codeLanguageLabel: string;
  codeFenceDisplayLabel?: string | undefined;
  codeFenceFilePath?: string | undefined;
  sourceLineRange?: ConversationExportSourceLineRange | undefined;
};

type ParsedConversationExportCodeFenceSourceLabel = {
  codeFenceFilePath: string;
  sourceLineRange?: ConversationExportSourceLineRange | undefined;
};

export function parseConversationExportCodeFenceInfo(codeFenceInfoString: string | undefined): ConversationExportCodeFenceInfo {
  const normalizedCodeFenceInfoString = codeFenceInfoString?.trim() ?? "";
  const firstCodeFenceInfoToken = normalizedCodeFenceInfoString.split(/\s+/)[0] || "code";
  const codeLanguageLabel = isConversationExportCodeFenceSourceLabel(firstCodeFenceInfoToken)
    ? "code"
    : firstCodeFenceInfoToken;
  const codeFenceFileLabel = resolveConversationExportCodeFenceFileLabel(normalizedCodeFenceInfoString);
  const parsedCodeFenceSourceLabel = codeFenceFileLabel ? parseConversationExportCodeFenceSourceLabel(codeFenceFileLabel) : undefined;
  const shouldShowCodeLanguageLabel = !genericConversationExportCodeFenceLanguageLabels.has(codeLanguageLabel.toLowerCase());
  return {
    codeLanguageLabel,
    ...(codeFenceFileLabel
      ? {
          codeFenceDisplayLabel: shouldShowCodeLanguageLabel ? `${codeLanguageLabel} · ${codeFenceFileLabel}` : codeFenceFileLabel,
          codeFenceFilePath: parsedCodeFenceSourceLabel?.codeFenceFilePath ?? codeFenceFileLabel,
        }
      : {}),
    ...(parsedCodeFenceSourceLabel?.sourceLineRange ? { sourceLineRange: parsedCodeFenceSourceLabel.sourceLineRange } : {}),
  };
}

function isConversationExportCodeFenceSourceLabel(codeFenceInfoToken: string): boolean {
  return codeFenceSourceLabelPattern.test(codeFenceInfoToken) || codeFenceFileMetadataTokenPattern.test(codeFenceInfoToken);
}

function resolveConversationExportCodeFenceFileLabel(codeFenceInfoString: string): string | undefined {
  const explicitCodeFenceFileLabelMatch = codeFenceFileLabelPattern.exec(codeFenceInfoString);
  const explicitCodeFenceFileLabel = explicitCodeFenceFileLabelMatch?.[1];
  if (explicitCodeFenceFileLabel) {
    return explicitCodeFenceFileLabel.replace(/^[']|[']$/g, "").replace(/^"|"$/g, "");
  }

  return codeFenceFallbackFileLabelPattern.exec(codeFenceInfoString)?.[1];
}

function parseConversationExportCodeFenceSourceLabel(
  codeFenceFileLabel: string,
): ParsedConversationExportCodeFenceSourceLabel {
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
