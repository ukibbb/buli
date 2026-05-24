import type { AssistantMarkdownCodeFenceInfo } from "./assistantMarkdownRenderSectionTypes.ts";

const assistantMarkdownGenericCodeFenceLanguageLabels = new Set(["code", "plain", "plaintext", "text", "txt"]);
const codeFenceFileLabelPattern = /(?:^|\s)(?:title|filename|file|path)=("[^"]+"|'[^']+'|[^\s]+)/i;
const codeFenceFallbackFileLabelPattern = /(?:^|\s)(\S+\/\S+\.\S+)/;

export function parseAssistantMarkdownCodeFenceInfo(codeFenceInfoString: string | undefined): AssistantMarkdownCodeFenceInfo {
  const normalizedCodeFenceInfoString = codeFenceInfoString?.trim() ?? "";
  const codeLanguageLabel = normalizedCodeFenceInfoString.split(/\s+/)[0] || "code";
  const codeFenceFileLabel = resolveAssistantMarkdownCodeFenceFileLabel(normalizedCodeFenceInfoString);
  const shouldShowCodeLanguageLabel = !isGenericAssistantMarkdownCodeFenceLanguageLabel(codeLanguageLabel);
  return {
    codeLanguageLabel,
    ...(codeFenceFileLabel
      ? {
          codeFenceDisplayLabel: shouldShowCodeLanguageLabel ? `${codeLanguageLabel} · ${codeFenceFileLabel}` : codeFenceFileLabel,
          codeFenceFilePath: codeFenceFileLabel,
        }
      : {}),
  };
}

export function areAssistantMarkdownCodeFenceInfoValuesEqual(
  previousCodeFenceInfo: AssistantMarkdownCodeFenceInfo,
  nextCodeFenceInfo: AssistantMarkdownCodeFenceInfo,
): boolean {
  return previousCodeFenceInfo.codeLanguageLabel === nextCodeFenceInfo.codeLanguageLabel &&
    previousCodeFenceInfo.codeFenceDisplayLabel === nextCodeFenceInfo.codeFenceDisplayLabel &&
    previousCodeFenceInfo.codeFenceFilePath === nextCodeFenceInfo.codeFenceFilePath;
}

function isGenericAssistantMarkdownCodeFenceLanguageLabel(codeLanguageLabel: string): boolean {
  return assistantMarkdownGenericCodeFenceLanguageLabels.has(codeLanguageLabel.toLowerCase());
}

function resolveAssistantMarkdownCodeFenceFileLabel(codeFenceInfoString: string): string | undefined {
  const explicitCodeFenceFileLabelMatch = codeFenceFileLabelPattern.exec(codeFenceInfoString);
  const explicitCodeFenceFileLabel = explicitCodeFenceFileLabelMatch?.[1];
  if (explicitCodeFenceFileLabel) {
    return explicitCodeFenceFileLabel.replace(/^[']|[']$/g, "").replace(/^"|"$/g, "");
  }

  return codeFenceFallbackFileLabelPattern.exec(codeFenceInfoString)?.[1];
}
