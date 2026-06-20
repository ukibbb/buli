import type {
  CreateMcpRuntimeIntegrationInput,
  McpRuntimeIntegration,
  McpServerRuntimeStatus,
  McpStreamableHttpServerConfiguration,
} from "@buli/mcp";
import { resolveMcpToolExecutionPolicy } from "@buli/mcp";
import {
  INVALID_MCP_BEARER_TOKEN_ENV_MESSAGE,
  INVALID_MCP_SERVER_CONFIGURATION_MESSAGE,
  INVALID_MCP_SERVERS_JSON_MESSAGE,
  INVALID_MCP_TOOL_EXECUTION_POLICY_MESSAGE,
  INVALID_MCP_TOOL_RESULT_RETENTION_MESSAGE,
  INVALID_NOVIBE_MCP_MISSING_BEARER_TOKEN_MESSAGE,
  INVALID_NOVIBE_MCP_TIMEOUT_MESSAGE,
  INVALID_NOVIBE_MCP_URL_MESSAGE,
  resolveInteractiveChatMcpServersConfiguration,
  type InteractiveChatEnvironment,
  type InteractiveChatMcpServersEnvironmentResolution,
} from "../interactiveChat/interactiveChatEnvironment.ts";

type CreateMcpRuntimeIntegration = (
  input: CreateMcpRuntimeIntegrationInput,
) => Promise<McpRuntimeIntegration>;

export type RunCheckMcpInput = Readonly<{
  environment?: InteractiveChatEnvironment | undefined;
  serverName?: string | undefined;
  createMcpRuntimeIntegration?: CreateMcpRuntimeIntegration | undefined;
}>;

export async function runCheckMcp(input: RunCheckMcpInput = {}): Promise<string> {
  const environment = input.environment ?? process.env;
  const mcpServersConfigurationResolution = resolveInteractiveChatMcpServersConfiguration({ environment });

  if (mcpServersConfigurationResolution.status === "disabled") {
    return [
      "MCP is disabled.",
      "Set BULI_MCP_SERVERS_JSON or BULI_NOVIBE_MCP_BEARER_TOKEN to enable it.",
    ].join("\n");
  }

  if (mcpServersConfigurationResolution.status === "invalid") {
    return formatInvalidMcpConfigurationMessage({
      resolution: mcpServersConfigurationResolution,
      environment,
    });
  }

  const serverConfigurationSelection = selectMcpServerConfigurationsForCheck({
    requestedServerName: input.serverName,
    serverConfigurations: mcpServersConfigurationResolution.configuration.serverConfigurations,
  });
  if (serverConfigurationSelection.status === "missing_server") {
    return formatMissingMcpServerMessage({
      requestedServerName: serverConfigurationSelection.requestedServerName,
      configuredServerNames: serverConfigurationSelection.configuredServerNames,
    });
  }

  const createMcpRuntimeIntegration = input.createMcpRuntimeIntegration ?? createDefaultMcpRuntimeIntegration;
  let mcpRuntimeIntegration: McpRuntimeIntegration | undefined;

  try {
    mcpRuntimeIntegration = await createMcpRuntimeIntegration({
      serverConfigurations: serverConfigurationSelection.selectedServerConfigurations,
    });
    return formatMcpCheckResult({
      checkedServerConfigurations: serverConfigurationSelection.selectedServerConfigurations,
      runtimeIntegration: mcpRuntimeIntegration,
    });
  } catch (error) {
    return [
      "MCP check failed.",
      `Error: ${redactMcpServerSecrets({
        text: formatUnknownErrorMessage(error),
        serverConfigurations: serverConfigurationSelection.selectedServerConfigurations,
      })}`,
    ].join("\n");
  } finally {
    await disposeMcpRuntimeIntegration(mcpRuntimeIntegration);
  }
}

async function createDefaultMcpRuntimeIntegration(
  input: CreateMcpRuntimeIntegrationInput,
): Promise<McpRuntimeIntegration> {
  const mcpModule = await import("@buli/mcp");
  return mcpModule.createMcpRuntimeIntegration(input);
}

function selectMcpServerConfigurationsForCheck(input: {
  requestedServerName: string | undefined;
  serverConfigurations: readonly McpStreamableHttpServerConfiguration[];
}):
  | { status: "selected"; selectedServerConfigurations: readonly McpStreamableHttpServerConfiguration[] }
  | { status: "missing_server"; requestedServerName: string; configuredServerNames: readonly string[] } {
  const requestedServerName = input.requestedServerName?.trim();
  if (!requestedServerName) {
    return { status: "selected", selectedServerConfigurations: input.serverConfigurations };
  }

  const selectedServerConfigurations = input.serverConfigurations.filter(
    (serverConfiguration) => serverConfiguration.serverName === requestedServerName,
  );
  if (selectedServerConfigurations.length > 0) {
    return { status: "selected", selectedServerConfigurations };
  }

  return {
    status: "missing_server",
    requestedServerName,
    configuredServerNames: input.serverConfigurations.map((serverConfiguration) => serverConfiguration.serverName),
  };
}

function formatMissingMcpServerMessage(input: {
  requestedServerName: string;
  configuredServerNames: readonly string[];
}): string {
  return [
    `MCP server is not configured: ${input.requestedServerName}`,
    `Configured servers (${input.configuredServerNames.length}):`,
    ...input.configuredServerNames.map((configuredServerName) => `- ${configuredServerName}`),
  ].join("\n");
}

function formatInvalidMcpConfigurationMessage(input: {
  resolution: Extract<InteractiveChatMcpServersEnvironmentResolution, { status: "invalid" }>;
  environment: InteractiveChatEnvironment;
}): string {
  switch (input.resolution.invalidReason) {
    case "invalid_json":
      return INVALID_MCP_SERVERS_JSON_MESSAGE;
    case "invalid_server_configuration":
      return INVALID_MCP_SERVER_CONFIGURATION_MESSAGE;
    case "missing_bearer_token_env":
      return INVALID_MCP_BEARER_TOKEN_ENV_MESSAGE;
    case "invalid_tool_result_retention":
      return INVALID_MCP_TOOL_RESULT_RETENTION_MESSAGE;
    case "invalid_tool_execution_policy":
      return INVALID_MCP_TOOL_EXECUTION_POLICY_MESSAGE;
    case "missing_bearer_token":
      return INVALID_NOVIBE_MCP_MISSING_BEARER_TOKEN_MESSAGE;
    case "invalid_url":
      return input.environment.BULI_MCP_SERVERS_JSON?.trim()
        ? INVALID_MCP_SERVER_CONFIGURATION_MESSAGE
        : INVALID_NOVIBE_MCP_URL_MESSAGE;
    case "invalid_timeout":
      return input.environment.BULI_MCP_SERVERS_JSON?.trim()
        ? INVALID_MCP_SERVER_CONFIGURATION_MESSAGE
        : INVALID_NOVIBE_MCP_TIMEOUT_MESSAGE;
  }
}

function formatMcpCheckResult(input: {
  checkedServerConfigurations: readonly McpStreamableHttpServerConfiguration[];
  runtimeIntegration: McpRuntimeIntegration;
}): string {
  const runtimeStatusesByServerName = new Map(
    input.runtimeIntegration.serverStatuses.map((serverStatus) => [serverStatus.serverName, serverStatus]),
  );
  const orderedRuntimeStatuses = input.checkedServerConfigurations.flatMap((serverConfiguration) => {
    const runtimeStatus = runtimeStatusesByServerName.get(serverConfiguration.serverName);
    return runtimeStatus ? [runtimeStatus] : [];
  });
  const orderedServerNames = new Set(orderedRuntimeStatuses.map((serverStatus) => serverStatus.serverName));
  const additionalRuntimeStatuses = input.runtimeIntegration.serverStatuses.filter(
    (serverStatus) => !orderedServerNames.has(serverStatus.serverName),
  );

  return [...orderedRuntimeStatuses, ...additionalRuntimeStatuses].map((serverStatus) =>
    formatMcpServerStatus({
      serverStatus,
      serverConfigurations: input.checkedServerConfigurations,
    })
  ).join("\n\n");
}

function formatMcpServerStatus(input: {
  serverStatus: McpServerRuntimeStatus;
  serverConfigurations: readonly McpStreamableHttpServerConfiguration[];
}): string {
  if (input.serverStatus.statusKind === "connected") {
    return formatConnectedMcpServerStatus({
      serverStatus: input.serverStatus,
      serverConfiguration: findCheckedMcpServerConfiguration(input),
    });
  }

  if (input.serverStatus.statusKind === "unavailable") {
    return formatUnavailableMcpServerStatus({
      serverStatus: input.serverStatus,
      serverConfigurations: input.serverConfigurations,
    });
  }

  return [
    `${input.serverStatus.displayName} MCP skipped: ${input.serverStatus.url}`,
    ...formatMcpConfiguredToolExecutionPolicyLines(findCheckedMcpServerConfiguration(input)),
    `Reason: ${input.serverStatus.reason}`,
  ].join("\n");
}

function formatConnectedMcpServerStatus(input: {
  serverStatus: Extract<McpServerRuntimeStatus, { statusKind: "connected" }>;
  serverConfiguration: McpStreamableHttpServerConfiguration | undefined;
}): string {
  return [
    `${input.serverStatus.displayName} MCP connected: ${input.serverStatus.url}`,
    ...formatMcpConfiguredToolExecutionPolicyLines(input.serverConfiguration),
    `Tools (${input.serverStatus.toolNames.length}):`,
    ...input.serverStatus.toolNames.map((toolName) => `- ${toolName}`),
  ].join("\n");
}

function formatUnavailableMcpServerStatus(input: {
  serverStatus: Extract<McpServerRuntimeStatus, { statusKind: "unavailable" }>;
  serverConfigurations: readonly McpStreamableHttpServerConfiguration[];
}): string {
  return [
    `${input.serverStatus.displayName} MCP unavailable: ${input.serverStatus.url}`,
    ...formatMcpConfiguredToolExecutionPolicyLines(findCheckedMcpServerConfiguration(input)),
    `Error: ${redactMcpServerSecrets({
      text: input.serverStatus.errorMessage,
      serverConfigurations: input.serverConfigurations,
    })}`,
  ].join("\n");
}

function findCheckedMcpServerConfiguration(input: {
  serverStatus: McpServerRuntimeStatus;
  serverConfigurations: readonly McpStreamableHttpServerConfiguration[];
}): McpStreamableHttpServerConfiguration | undefined {
  return input.serverConfigurations.find((serverConfiguration) => serverConfiguration.serverName === input.serverStatus.serverName);
}

function formatMcpConfiguredToolExecutionPolicyLines(
  serverConfiguration: McpStreamableHttpServerConfiguration | undefined,
): readonly string[] {
  return serverConfiguration
    ? [`Tool execution policy: ${resolveMcpToolExecutionPolicy(serverConfiguration)}`]
    : [];
}

async function disposeMcpRuntimeIntegration(
  runtimeIntegration: McpRuntimeIntegration | undefined,
): Promise<void> {
  try {
    await runtimeIntegration?.dispose();
  } catch {
    // The check command is a setup probe. A cleanup failure should not hide the
    // connection result, and the MCP runtime's normal disposer already uses
    // best-effort cleanup for SDK client/transport shutdown.
  }
}

function redactMcpServerSecrets(input: {
  text: string;
  serverConfigurations: readonly McpStreamableHttpServerConfiguration[];
}): string {
  const secretTexts = collectMcpServerSecretTexts(input.serverConfigurations);
  return secretTexts.reduce(
    (redactedText, secretText) => redactedText.split(secretText).join("[redacted]"),
    input.text,
  );
}

function collectMcpServerSecretTexts(
  serverConfigurations: readonly McpStreamableHttpServerConfiguration[],
): readonly string[] {
  const secretTexts = new Set<string>();

  for (const serverConfiguration of serverConfigurations) {
    if (serverConfiguration.bearerToken) {
      secretTexts.add(serverConfiguration.bearerToken);
    }

    for (const header of serverConfiguration.headers ?? []) {
      if (!isSecretLikeHeaderName(header.name)) {
        continue;
      }

      secretTexts.add(header.value);
      const bearerTokenMatch = /^Bearer\s+(.+)$/iu.exec(header.value.trim());
      if (bearerTokenMatch?.[1]) {
        secretTexts.add(bearerTokenMatch[1]);
      }
    }
  }

  return [...secretTexts].filter((secretText) => secretText.length > 0).sort((left, right) => right.length - left.length);
}

function isSecretLikeHeaderName(headerName: string): boolean {
  const normalizedHeaderName = headerName.toLowerCase();
  return normalizedHeaderName.includes("authorization") ||
    normalizedHeaderName.includes("auth") ||
    normalizedHeaderName.includes("token") ||
    normalizedHeaderName.includes("secret") ||
    normalizedHeaderName.includes("key") ||
    normalizedHeaderName.includes("cookie");
}

function formatUnknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
