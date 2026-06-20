import { dirname, resolve, sep } from "node:path";
import { ReasoningEffortSchema, type ReasoningEffort } from "@buli/contracts";
import { parseBashToolApprovalMode, type BashToolApprovalMode, type TaskSubagentProviderModelSelectionPolicy } from "@buli/engine";
import type {
  McpStreamableHttpHeader,
  McpStreamableHttpServerConfiguration,
  McpToolExecutionPolicy,
  McpToolResultRetentionPolicy,
} from "@buli/mcp";

export const INVALID_BASH_TOOL_APPROVAL_MODE_MESSAGE = "Invalid BULI_BASH_APPROVAL_MODE. Use `risk_based` or `trusted`.";
export const INVALID_AUTO_COMPACTION_THRESHOLD_MESSAGE = "Invalid BULI_AUTO_COMPACT_THRESHOLD. Use a number from 0 through 1.";
export const INVALID_READ_ONLY_TOOL_CONCURRENCY_MESSAGE = "Invalid BULI_READ_ONLY_TOOL_CONCURRENCY. Use a positive integer.";
export const INVALID_SUBAGENT_CONCURRENCY_MESSAGE = "Invalid BULI_SUBAGENT_CONCURRENCY. Use a positive integer.";
export const INVALID_OPENAI_MAX_CONCURRENT_STREAMS_MESSAGE = "Invalid BULI_OPENAI_MAX_CONCURRENT_STREAMS. Use a positive integer.";
export const INVALID_TASK_SUBAGENT_SOFT_ELAPSED_TIME_CHECKPOINT_MESSAGE = "Invalid BULI_TASK_SUBAGENT_SOFT_ELAPSED_TIME_CHECKPOINT_MS. Use a positive integer number of milliseconds.";
export const INVALID_TASK_SUBAGENT_MAX_REASONING_EFFORT_MESSAGE = "Invalid BULI_TASK_SUBAGENT_MAX_REASONING_EFFORT. Use none, minimal, low, medium, high, or xhigh.";
export const INVALID_MCP_SERVERS_JSON_MESSAGE = "Invalid BULI_MCP_SERVERS_JSON. Use a JSON object keyed by MCP server name.";
export const INVALID_MCP_SERVER_CONFIGURATION_MESSAGE = "Invalid BULI_MCP_SERVERS_JSON server configuration. Each server needs transport \"streamable_http\" and an absolute http(s) url.";
export const INVALID_MCP_BEARER_TOKEN_ENV_MESSAGE = "Invalid BULI_MCP_SERVERS_JSON bearerTokenEnv. It must name an environment variable that is set.";
export const INVALID_MCP_TOOL_RESULT_RETENTION_MESSAGE = "Invalid BULI_MCP_SERVERS_JSON toolResultRetention. Use full, summary, or redacted.";
export const INVALID_MCP_TOOL_EXECUTION_POLICY_MESSAGE = "Invalid BULI_MCP_SERVERS_JSON toolExecutionPolicy. Use requires_user_approval or read_only_auto_approved.";
export const INVALID_NOVIBE_MCP_MISSING_BEARER_TOKEN_MESSAGE = "Invalid NoVibe MCP configuration. Set BULI_NOVIBE_MCP_BEARER_TOKEN when BULI_NOVIBE_MCP_URL or BULI_NOVIBE_MCP_TIMEOUT_MS is configured.";
export const INVALID_NOVIBE_MCP_URL_MESSAGE = "Invalid BULI_NOVIBE_MCP_URL. Use an absolute http(s) URL.";
export const INVALID_NOVIBE_MCP_TIMEOUT_MESSAGE = "Invalid BULI_NOVIBE_MCP_TIMEOUT_MS. Use a positive integer number of milliseconds.";
export const OPENAI_PROVIDER_PROTOCOL_IPC_ENVIRONMENT_VALUE = "1";
export const DEFAULT_NOVIBE_MCP_URL = "http://localhost:8001/v1/mcp/";
export const DEFAULT_NOVIBE_MCP_TIMEOUT_MS = 30_000;

const DEFAULT_INTERACTIVE_CHAT_BASH_TOOL_APPROVAL_MODE: BashToolApprovalMode = "trusted";

export type InteractiveChatEnvironment = Readonly<{
  [environmentVariableName: string]: string | undefined;
  BULI_BASH_APPROVAL_MODE?: string | undefined;
  BULI_AUTO_COMPACT_THRESHOLD?: string | undefined;
  BULI_READ_ONLY_TOOL_CONCURRENCY?: string | undefined;
  BULI_SUBAGENT_CONCURRENCY?: string | undefined;
  BULI_OPENAI_MAX_CONCURRENT_STREAMS?: string | undefined;
  BULI_TASK_SUBAGENT_SOFT_ELAPSED_TIME_CHECKPOINT_MS?: string | undefined;
  BULI_TASK_SUBAGENT_MODEL?: string | undefined;
  BULI_TASK_SUBAGENT_MAX_REASONING_EFFORT?: string | undefined;
  BULI_PROMPT_CONTEXT_ROOT?: string | undefined;
  BULI_PROVIDER_IPC?: string | undefined;
  BULI_PROVIDER_HOST_COMMAND?: string | undefined;
  BULI_OPENAI_AUTH_FILE?: string | undefined;
  BULI_MCP_SERVERS_JSON?: string | undefined;
  BULI_NOVIBE_MCP_BEARER_TOKEN?: string | undefined;
  BULI_NOVIBE_MCP_URL?: string | undefined;
  BULI_NOVIBE_MCP_TIMEOUT_MS?: string | undefined;
}>;

export type AutoCompactionThresholdResolution =
  | { status: "resolved"; thresholdRatio?: number }
  | { status: "invalid" };

export type PositiveIntegerEnvironmentResolution =
  | { status: "resolved"; value?: number }
  | { status: "invalid" };

export type TaskSubagentProviderModelSelectionPolicyEnvironmentResolution =
  | { status: "resolved"; policy?: TaskSubagentProviderModelSelectionPolicy }
  | { status: "invalid" };

export type NoVibeMcpEnvironmentConfiguration = Readonly<{
  mcpUrl: string;
  bearerToken: string;
  timeoutMs: number;
}>;

export type NoVibeMcpEnvironmentResolution =
  | { status: "disabled" }
  | { status: "resolved"; configuration: NoVibeMcpEnvironmentConfiguration }
  | { status: "invalid"; invalidReason: "missing_bearer_token" | "invalid_url" | "invalid_timeout" };

export type InteractiveChatMcpServersEnvironmentConfiguration = Readonly<{
  serverConfigurations: readonly McpStreamableHttpServerConfiguration[];
}>;

export type InteractiveChatMcpServersEnvironmentInvalidReason =
  | "invalid_json"
  | "invalid_server_configuration"
  | "missing_bearer_token_env"
  | "invalid_tool_result_retention"
  | "invalid_tool_execution_policy"
  | "missing_bearer_token"
  | "invalid_url"
  | "invalid_timeout";

export type InteractiveChatMcpServersEnvironmentResolution =
  | { status: "disabled" }
  | { status: "resolved"; configuration: InteractiveChatMcpServersEnvironmentConfiguration }
  | { status: "invalid"; invalidReason: InteractiveChatMcpServersEnvironmentInvalidReason };

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

export function resolveInteractiveChatTaskSubagentSoftElapsedTimeCheckpointMilliseconds(input: {
  environment: InteractiveChatEnvironment;
}): PositiveIntegerEnvironmentResolution {
  return resolvePositiveIntegerEnvironmentValue(input.environment.BULI_TASK_SUBAGENT_SOFT_ELAPSED_TIME_CHECKPOINT_MS);
}

export function resolveInteractiveChatTaskSubagentProviderModelSelectionPolicy(input: {
  environment: InteractiveChatEnvironment;
}): TaskSubagentProviderModelSelectionPolicyEnvironmentResolution {
  const selectedModelIdOverride = input.environment.BULI_TASK_SUBAGENT_MODEL?.trim();
  const maximumReasoningEffortResolution = resolveOptionalReasoningEffortEnvironmentValue(
    input.environment.BULI_TASK_SUBAGENT_MAX_REASONING_EFFORT,
  );
  if (maximumReasoningEffortResolution.status === "invalid") {
    return { status: "invalid" };
  }

  if (!selectedModelIdOverride && maximumReasoningEffortResolution.value === undefined) {
    return { status: "resolved" };
  }

  return {
    status: "resolved",
    policy: {
      ...(selectedModelIdOverride ? { selectedModelIdOverride } : {}),
      ...(maximumReasoningEffortResolution.value !== undefined
        ? { maximumReasoningEffort: maximumReasoningEffortResolution.value }
        : {}),
    },
  };
}

export function resolveInteractiveChatProviderIpcEnabled(input: {
  environment: InteractiveChatEnvironment;
}): boolean {
  return input.environment.BULI_PROVIDER_IPC?.trim() === OPENAI_PROVIDER_PROTOCOL_IPC_ENVIRONMENT_VALUE;
}

export function resolveInteractiveChatNoVibeMcpConfiguration(input: {
  environment: InteractiveChatEnvironment;
}): NoVibeMcpEnvironmentResolution {
  const bearerToken = input.environment.BULI_NOVIBE_MCP_BEARER_TOKEN?.trim();
  const requestedMcpUrl = input.environment.BULI_NOVIBE_MCP_URL?.trim();
  const requestedTimeoutMs = input.environment.BULI_NOVIBE_MCP_TIMEOUT_MS?.trim();
  if (!bearerToken) {
    return requestedMcpUrl || requestedTimeoutMs
      ? { status: "invalid", invalidReason: "missing_bearer_token" }
      : { status: "disabled" };
  }

  const resolvedMcpUrl = parseHttpUrl(requestedMcpUrl || DEFAULT_NOVIBE_MCP_URL);
  if (!resolvedMcpUrl) {
    return { status: "invalid", invalidReason: "invalid_url" };
  }

  const timeoutMsResolution = resolvePositiveIntegerEnvironmentValue(requestedTimeoutMs);
  if (timeoutMsResolution.status === "invalid") {
    return { status: "invalid", invalidReason: "invalid_timeout" };
  }

  return {
    status: "resolved",
    configuration: {
      mcpUrl: resolvedMcpUrl.href,
      bearerToken,
      timeoutMs: timeoutMsResolution.value ?? DEFAULT_NOVIBE_MCP_TIMEOUT_MS,
    },
  };
}

export function resolveInteractiveChatMcpServersConfiguration(input: {
  environment: InteractiveChatEnvironment;
}): InteractiveChatMcpServersEnvironmentResolution {
  const genericMcpServersJson = input.environment.BULI_MCP_SERVERS_JSON?.trim();
  const genericServerConfigurationResolution = genericMcpServersJson
    ? parseGenericMcpServerConfigurations({
        genericMcpServersJson,
        environment: input.environment,
      })
    : { status: "resolved", serverConfigurations: [] } satisfies GenericMcpServerConfigurationsParseResolution;
  if (genericServerConfigurationResolution.status === "invalid") {
    return { status: "invalid", invalidReason: genericServerConfigurationResolution.invalidReason };
  }

  const serverConfigurations = [...genericServerConfigurationResolution.serverConfigurations];
  if (!serverConfigurations.some((serverConfiguration) => serverConfiguration.serverName === "novibe")) {
    const noVibeMcpConfigurationResolution = resolveInteractiveChatNoVibeMcpConfiguration(input);
    if (noVibeMcpConfigurationResolution.status === "invalid") {
      return { status: "invalid", invalidReason: noVibeMcpConfigurationResolution.invalidReason };
    }
    if (noVibeMcpConfigurationResolution.status === "resolved") {
      serverConfigurations.push({
        serverName: "novibe",
        displayName: "NoVibe",
        transport: "streamable_http",
        url: noVibeMcpConfigurationResolution.configuration.mcpUrl,
        bearerToken: noVibeMcpConfigurationResolution.configuration.bearerToken,
        timeoutMs: noVibeMcpConfigurationResolution.configuration.timeoutMs,
        toolExecutionPolicy: "read_only_auto_approved",
      });
    }
  }

  if (serverConfigurations.length === 0) {
    return { status: "disabled" };
  }

  return {
    status: "resolved",
    configuration: { serverConfigurations },
  };
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

type GenericMcpServerConfigurationsParseResolution =
  | { status: "resolved"; serverConfigurations: readonly McpStreamableHttpServerConfiguration[] }
  | { status: "invalid"; invalidReason: "invalid_json" | GenericMcpServerConfigurationInvalidReason };

type GenericMcpServerConfigurationInvalidReason =
  | "invalid_server_configuration"
  | "missing_bearer_token_env"
  | "invalid_tool_result_retention"
  | "invalid_tool_execution_policy"
  | "invalid_url"
  | "invalid_timeout";

function parseGenericMcpServerConfigurations(input: {
  genericMcpServersJson: string;
  environment: InteractiveChatEnvironment;
}): GenericMcpServerConfigurationsParseResolution {
  let parsedMcpServersJson: unknown;
  try {
    parsedMcpServersJson = JSON.parse(input.genericMcpServersJson) as unknown;
  } catch {
    return { status: "invalid", invalidReason: "invalid_json" };
  }

  if (!isJsonRecord(parsedMcpServersJson)) {
    return { status: "invalid", invalidReason: "invalid_json" };
  }

  const serverConfigurations: McpStreamableHttpServerConfiguration[] = [];
  for (const [serverName, rawServerConfiguration] of Object.entries(parsedMcpServersJson)) {
    const serverConfigurationResolution = parseGenericMcpServerConfiguration({
      serverName,
      rawServerConfiguration,
      environment: input.environment,
    });
    if (serverConfigurationResolution.status === "invalid") {
      return { status: "invalid", invalidReason: serverConfigurationResolution.invalidReason };
    }

    serverConfigurations.push(serverConfigurationResolution.serverConfiguration);
  }

  return { status: "resolved", serverConfigurations };
}

function parseGenericMcpServerConfiguration(input: {
  serverName: string;
  rawServerConfiguration: unknown;
  environment: InteractiveChatEnvironment;
}):
  | { status: "resolved"; serverConfiguration: McpStreamableHttpServerConfiguration }
  | { status: "invalid"; invalidReason: GenericMcpServerConfigurationInvalidReason } {
  if (!input.serverName.trim() || !isJsonRecord(input.rawServerConfiguration)) {
    return { status: "invalid", invalidReason: "invalid_server_configuration" };
  }
  if (input.rawServerConfiguration["transport"] !== "streamable_http") {
    return { status: "invalid", invalidReason: "invalid_server_configuration" };
  }

  const rawUrl = input.rawServerConfiguration["url"];
  if (typeof rawUrl !== "string") {
    return { status: "invalid", invalidReason: "invalid_server_configuration" };
  }
  const parsedUrl = parseHttpUrl(rawUrl.trim());
  if (!parsedUrl) {
    return { status: "invalid", invalidReason: "invalid_url" };
  }

  const timeoutMsResolution = resolvePositiveIntegerEnvironmentValue(
    typeof input.rawServerConfiguration["timeoutMs"] === "number" || typeof input.rawServerConfiguration["timeoutMs"] === "string"
      ? String(input.rawServerConfiguration["timeoutMs"])
      : undefined,
  );
  if (timeoutMsResolution.status === "invalid") {
    return { status: "invalid", invalidReason: "invalid_timeout" };
  }

  const toolResultRetentionResolution = parseMcpToolResultRetentionPolicy(input.rawServerConfiguration["toolResultRetention"]);
  if (toolResultRetentionResolution.status === "invalid") {
    return { status: "invalid", invalidReason: "invalid_tool_result_retention" };
  }

  const toolExecutionPolicyResolution = parseMcpToolExecutionPolicy(input.rawServerConfiguration["toolExecutionPolicy"]);
  if (toolExecutionPolicyResolution.status === "invalid") {
    return { status: "invalid", invalidReason: "invalid_tool_execution_policy" };
  }

  const bearerTokenResolution = resolveMcpBearerTokenFromEnvironment({
    rawBearerTokenEnvironmentVariableName: input.rawServerConfiguration["bearerTokenEnv"],
    environment: input.environment,
  });
  if (bearerTokenResolution.status === "invalid") {
    return { status: "invalid", invalidReason: "missing_bearer_token_env" };
  }

  const headersResolution = parseMcpStreamableHttpHeaders(input.rawServerConfiguration["headers"]);
  if (headersResolution.status === "invalid") {
    return { status: "invalid", invalidReason: "invalid_server_configuration" };
  }

  return {
    status: "resolved",
    serverConfiguration: {
      serverName: input.serverName.trim(),
      ...(typeof input.rawServerConfiguration["displayName"] === "string" && input.rawServerConfiguration["displayName"].trim()
        ? { displayName: input.rawServerConfiguration["displayName"].trim() }
        : {}),
      transport: "streamable_http",
      url: parsedUrl.href,
      ...(typeof input.rawServerConfiguration["enabled"] === "boolean" ? { enabled: input.rawServerConfiguration["enabled"] } : {}),
      timeoutMs: timeoutMsResolution.value ?? DEFAULT_NOVIBE_MCP_TIMEOUT_MS,
      ...(bearerTokenResolution.bearerToken !== undefined ? { bearerToken: bearerTokenResolution.bearerToken } : {}),
      ...(headersResolution.headers.length > 0 ? { headers: headersResolution.headers } : {}),
      ...(toolResultRetentionResolution.toolResultRetention !== undefined
        ? { toolResultRetention: toolResultRetentionResolution.toolResultRetention }
        : {}),
      ...(toolExecutionPolicyResolution.toolExecutionPolicy !== undefined
        ? { toolExecutionPolicy: toolExecutionPolicyResolution.toolExecutionPolicy }
        : {}),
    },
  };
}

function parseMcpToolResultRetentionPolicy(rawToolResultRetention: unknown):
  | { status: "resolved"; toolResultRetention?: McpToolResultRetentionPolicy | undefined }
  | { status: "invalid" } {
  if (rawToolResultRetention === undefined) {
    return { status: "resolved" };
  }
  if (
    rawToolResultRetention === "full" ||
    rawToolResultRetention === "summary" ||
    rawToolResultRetention === "redacted"
  ) {
    return { status: "resolved", toolResultRetention: rawToolResultRetention };
  }

  return { status: "invalid" };
}

function parseMcpToolExecutionPolicy(rawToolExecutionPolicy: unknown):
  | { status: "resolved"; toolExecutionPolicy?: McpToolExecutionPolicy | undefined }
  | { status: "invalid" } {
  if (rawToolExecutionPolicy === undefined) {
    return { status: "resolved" };
  }
  if (
    rawToolExecutionPolicy === "requires_user_approval" ||
    rawToolExecutionPolicy === "read_only_auto_approved"
  ) {
    return { status: "resolved", toolExecutionPolicy: rawToolExecutionPolicy };
  }

  return { status: "invalid" };
}

function resolveMcpBearerTokenFromEnvironment(input: {
  rawBearerTokenEnvironmentVariableName: unknown;
  environment: InteractiveChatEnvironment;
}): { status: "resolved"; bearerToken?: string | undefined } | { status: "invalid" } {
  if (input.rawBearerTokenEnvironmentVariableName === undefined) {
    return { status: "resolved" };
  }
  if (typeof input.rawBearerTokenEnvironmentVariableName !== "string" || !input.rawBearerTokenEnvironmentVariableName.trim()) {
    return { status: "invalid" };
  }

  const bearerToken = input.environment[input.rawBearerTokenEnvironmentVariableName.trim()]?.trim();
  return bearerToken ? { status: "resolved", bearerToken } : { status: "invalid" };
}

function parseMcpStreamableHttpHeaders(rawHeaders: unknown):
  | { status: "resolved"; headers: readonly McpStreamableHttpHeader[] }
  | { status: "invalid" } {
  if (rawHeaders === undefined) {
    return { status: "resolved", headers: [] };
  }
  if (!isJsonRecord(rawHeaders)) {
    return { status: "invalid" };
  }

  const headers: McpStreamableHttpHeader[] = [];
  for (const [name, value] of Object.entries(rawHeaders)) {
    if (!name.trim() || typeof value !== "string") {
      return { status: "invalid" };
    }
    headers.push({ name: name.trim(), value });
  }

  return { status: "resolved", headers };
}

function parseHttpUrl(requestedUrl: string): URL | undefined {
  try {
    const parsedUrl = new URL(requestedUrl);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:" ? parsedUrl : undefined;
  } catch {
    return undefined;
  }
}

function isJsonRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveOptionalReasoningEffortEnvironmentValue(
  requestedEnvironmentValue: string | undefined,
): { status: "resolved"; value?: ReasoningEffort } | { status: "invalid" } {
  const environmentValue = requestedEnvironmentValue?.trim();
  if (!environmentValue) {
    return { status: "resolved" };
  }

  const parsedReasoningEffort = ReasoningEffortSchema.safeParse(environmentValue);
  if (!parsedReasoningEffort.success) {
    return { status: "invalid" };
  }

  return { status: "resolved", value: parsedReasoningEffort.data };
}
