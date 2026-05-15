import type { PromptContextQueryLoadStrategy } from "./types.ts";

type PromptContextPathQuery = {
  queryDirectoryPathText: string;
  entryNameQuery: string;
};

export function determinePromptContextQueryLoadStrategy(promptContextQueryText: string): PromptContextQueryLoadStrategy {
  const normalizedPromptContextQueryText = normalizePromptContextQueryText(promptContextQueryText);
  if (normalizedPromptContextQueryText.length === 0) {
    return "browse_current_directory";
  }

  return parsePromptContextPathQuery(normalizedPromptContextQueryText) ? "path_query" : "fuzzy_query";
}

function parsePromptContextPathQuery(promptContextQueryText: string): PromptContextPathQuery | undefined {
  if (promptContextQueryText === "~") {
    return { queryDirectoryPathText: "~/", entryNameQuery: "" };
  }

  if (promptContextQueryText.startsWith("~") && !promptContextQueryText.startsWith("~/")) {
    return {
      queryDirectoryPathText: "~/",
      entryNameQuery: promptContextQueryText.slice(1),
    };
  }

  if (promptContextQueryText === "." || promptContextQueryText === "..") {
    return {
      queryDirectoryPathText: `${promptContextQueryText}/`,
      entryNameQuery: "",
    };
  }

  if (!promptContextQueryText.includes("/")) {
    return undefined;
  }

  if (promptContextQueryText.endsWith("/")) {
    return {
      queryDirectoryPathText: promptContextQueryText,
      entryNameQuery: "",
    };
  }

  const lastSlashIndex = promptContextQueryText.lastIndexOf("/");
  return {
    queryDirectoryPathText: promptContextQueryText.slice(0, lastSlashIndex + 1),
    entryNameQuery: promptContextQueryText.slice(lastSlashIndex + 1),
  };
}

function normalizePromptContextQueryText(promptContextQueryText: string): string {
  const queryWithoutLeadingQuote = promptContextQueryText.startsWith('"')
    ? promptContextQueryText.slice(1)
    : promptContextQueryText;
  return queryWithoutLeadingQuote.replace(/\\([\\"\s])/g, "$1");
}
