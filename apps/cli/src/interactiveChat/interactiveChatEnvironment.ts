import { dirname, resolve, sep } from "node:path";
import {
  DEFAULT_BASH_TOOL_APPROVAL_MODE,
  parseBashToolApprovalMode,
  type BashToolApprovalMode,
} from "@buli/engine";

export const INVALID_BASH_TOOL_APPROVAL_MODE_MESSAGE = "Invalid BULI_BASH_APPROVAL_MODE. Use `risk_based` or `trusted`.";
export const INVALID_AUTO_COMPACTION_THRESHOLD_MESSAGE = "Invalid BULI_AUTO_COMPACT_THRESHOLD. Use a number from 0 through 1.";

export type InteractiveChatEnvironment = Readonly<{
  [environmentVariableName: string]: string | undefined;
  BULI_BASH_APPROVAL_MODE?: string | undefined;
  BULI_AUTO_COMPACT_THRESHOLD?: string | undefined;
  BULI_PROMPT_CONTEXT_ROOT?: string | undefined;
}>;

export type AutoCompactionThresholdResolution =
  | { status: "resolved"; thresholdRatio?: number }
  | { status: "invalid" };

export type PromptContextScopeResolution = {
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath: string;
};

export function resolveInteractiveChatBashToolApprovalMode(input: {
  requestedBashToolApprovalMode: BashToolApprovalMode | undefined;
  environment: InteractiveChatEnvironment;
}): BashToolApprovalMode | undefined {
  if (input.requestedBashToolApprovalMode) {
    return input.requestedBashToolApprovalMode;
  }

  const environmentBashToolApprovalMode = input.environment.BULI_BASH_APPROVAL_MODE?.trim();
  if (!environmentBashToolApprovalMode) {
    return DEFAULT_BASH_TOOL_APPROVAL_MODE;
  }

  return parseBashToolApprovalMode(environmentBashToolApprovalMode);
}

export function resolveConversationAutoCompactionThresholdRatio(input: {
  environment: InteractiveChatEnvironment;
}): AutoCompactionThresholdResolution {
  const environmentThresholdRatio = input.environment.BULI_AUTO_COMPACT_THRESHOLD?.trim();
  if (!environmentThresholdRatio) {
    return { status: "resolved" };
  }

  const thresholdRatio = Number(environmentThresholdRatio);
  if (!Number.isFinite(thresholdRatio) || thresholdRatio < 0 || thresholdRatio > 1) {
    return { status: "invalid" };
  }

  return { status: "resolved", thresholdRatio };
}

export function resolveInteractiveChatPromptContextScope(input: {
  workspaceRootPath: string;
  environment: InteractiveChatEnvironment;
}): PromptContextScopeResolution {
  const requestedPromptContextBrowseRootPath = input.environment.BULI_PROMPT_CONTEXT_ROOT?.trim();
  const promptContextBrowseRootPath = requestedPromptContextBrowseRootPath
    ? resolve(requestedPromptContextBrowseRootPath)
    : dirname(resolve(input.workspaceRootPath));

  return {
    promptContextBrowseRootPath,
    promptContextStartingDirectoryPath: resolvePromptContextStartingDirectoryPath({
      promptContextBrowseRootPath,
      requestedStartingDirectoryPath: input.workspaceRootPath,
    }),
  };
}

function resolvePromptContextStartingDirectoryPath(input: {
  promptContextBrowseRootPath: string;
  requestedStartingDirectoryPath: string;
}): string {
  const browseRootPath = resolve(input.promptContextBrowseRootPath);
  const requestedStartingDirectoryPath = resolve(input.requestedStartingDirectoryPath);
  if (
    requestedStartingDirectoryPath === browseRootPath
    || requestedStartingDirectoryPath.startsWith(`${browseRootPath}${sep}`)
  ) {
    return requestedStartingDirectoryPath;
  }

  return browseRootPath;
}
