import { dirname, resolve, sep } from "node:path";
import { parseBashToolApprovalMode, type BashToolApprovalMode } from "@buli/engine";

export const INVALID_BASH_TOOL_APPROVAL_MODE_MESSAGE = "Invalid BULI_BASH_APPROVAL_MODE. Use `risk_based` or `trusted`.";
export const INVALID_AUTO_COMPACTION_THRESHOLD_MESSAGE = "Invalid BULI_AUTO_COMPACT_THRESHOLD. Use a number from 0 through 1.";
export const INVALID_READ_ONLY_TOOL_CONCURRENCY_MESSAGE = "Invalid BULI_READ_ONLY_TOOL_CONCURRENCY. Use a positive integer.";
export const INVALID_SUBAGENT_CONCURRENCY_MESSAGE = "Invalid BULI_SUBAGENT_CONCURRENCY. Use a positive integer.";
export const INVALID_OPENAI_MAX_CONCURRENT_STREAMS_MESSAGE = "Invalid BULI_OPENAI_MAX_CONCURRENT_STREAMS. Use a positive integer.";
export const OPENAI_PROVIDER_PROTOCOL_IPC_ENVIRONMENT_VALUE = "1";

const DEFAULT_INTERACTIVE_CHAT_BASH_TOOL_APPROVAL_MODE: BashToolApprovalMode = "trusted";

export type InteractiveChatEnvironment = Readonly<{
  [environmentVariableName: string]: string | undefined;
  BULI_BASH_APPROVAL_MODE?: string | undefined;
  BULI_AUTO_COMPACT_THRESHOLD?: string | undefined;
  BULI_READ_ONLY_TOOL_CONCURRENCY?: string | undefined;
  BULI_SUBAGENT_CONCURRENCY?: string | undefined;
  BULI_OPENAI_MAX_CONCURRENT_STREAMS?: string | undefined;
  BULI_PROMPT_CONTEXT_ROOT?: string | undefined;
  BULI_PROVIDER_IPC?: string | undefined;
  BULI_PROVIDER_HOST_COMMAND?: string | undefined;
  BULI_OPENAI_AUTH_FILE?: string | undefined;
}>;

export type AutoCompactionThresholdResolution =
  | { status: "resolved"; thresholdRatio?: number }
  | { status: "invalid" };

export type PositiveIntegerEnvironmentResolution =
  | { status: "resolved"; value?: number }
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
    return DEFAULT_INTERACTIVE_CHAT_BASH_TOOL_APPROVAL_MODE;
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

export function resolveInteractiveChatReadOnlyToolConcurrency(input: {
  environment: InteractiveChatEnvironment;
}): PositiveIntegerEnvironmentResolution {
  return resolvePositiveIntegerEnvironmentValue(input.environment.BULI_READ_ONLY_TOOL_CONCURRENCY);
}

export function resolveInteractiveChatSubagentConcurrency(input: {
  environment: InteractiveChatEnvironment;
}): PositiveIntegerEnvironmentResolution {
  return resolvePositiveIntegerEnvironmentValue(input.environment.BULI_SUBAGENT_CONCURRENCY);
}

export function resolveInteractiveChatOpenAiMaxConcurrentStreams(input: {
  environment: InteractiveChatEnvironment;
}): PositiveIntegerEnvironmentResolution {
  return resolvePositiveIntegerEnvironmentValue(input.environment.BULI_OPENAI_MAX_CONCURRENT_STREAMS);
}

export function resolveInteractiveChatProviderIpcEnabled(input: {
  environment: InteractiveChatEnvironment;
}): boolean {
  return input.environment.BULI_PROVIDER_IPC?.trim() === OPENAI_PROVIDER_PROTOCOL_IPC_ENVIRONMENT_VALUE;
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

function resolvePositiveIntegerEnvironmentValue(
  requestedEnvironmentValue: string | undefined,
): PositiveIntegerEnvironmentResolution {
  const environmentValue = requestedEnvironmentValue?.trim();
  if (!environmentValue) {
    return { status: "resolved" };
  }

  const numericEnvironmentValue = Number(environmentValue);
  if (!Number.isInteger(numericEnvironmentValue) || numericEnvironmentValue < 1) {
    return { status: "invalid" };
  }

  return { status: "resolved", value: numericEnvironmentValue };
}
