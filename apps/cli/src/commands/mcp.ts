import type {
  McpServerRuntimeStatus,
  NoVibeMcpRuntimeIntegration,
  NoVibeMcpRuntimeIntegrationConfiguration,
} from "@buli/mcp";
import {
  INVALID_NOVIBE_MCP_MISSING_BEARER_TOKEN_MESSAGE,
  INVALID_NOVIBE_MCP_TIMEOUT_MESSAGE,
  INVALID_NOVIBE_MCP_URL_MESSAGE,
  resolveInteractiveChatNoVibeMcpConfiguration,
  type InteractiveChatEnvironment,
  type NoVibeMcpEnvironmentResolution,
} from "../interactiveChat/interactiveChatEnvironment.ts";

type CreateNoVibeMcpRuntimeIntegration = (
  configuration: NoVibeMcpRuntimeIntegrationConfiguration,
) => Promise<NoVibeMcpRuntimeIntegration>;

export type RunCheckNoVibeMcpInput = Readonly<{
  environment?: InteractiveChatEnvironment | undefined;
  createNoVibeMcpRuntimeIntegration?: CreateNoVibeMcpRuntimeIntegration | undefined;
}>;

export async function runCheckNoVibeMcp(input: RunCheckNoVibeMcpInput = {}): Promise<string> {
  const environment = input.environment ?? process.env;
  const noVibeMcpConfigurationResolution = resolveInteractiveChatNoVibeMcpConfiguration({ environment });

  if (noVibeMcpConfigurationResolution.status === "disabled") {
    return [
      "NoVibe MCP is disabled.",
      "Set BULI_NOVIBE_MCP_BEARER_TOKEN to enable it.",
    ].join("\n");
  }

  if (noVibeMcpConfigurationResolution.status === "invalid") {
    return formatInvalidNoVibeMcpConfigurationMessage(noVibeMcpConfigurationResolution);
  }

  const createNoVibeMcpRuntimeIntegration = input.createNoVibeMcpRuntimeIntegration ??
    createDefaultNoVibeMcpRuntimeIntegration;
  let noVibeMcpRuntimeIntegration: NoVibeMcpRuntimeIntegration | undefined;

  try {
    noVibeMcpRuntimeIntegration = await createNoVibeMcpRuntimeIntegration(noVibeMcpConfigurationResolution.configuration);
    return formatNoVibeMcpCheckResult({
      configuration: noVibeMcpConfigurationResolution.configuration,
      runtimeIntegration: noVibeMcpRuntimeIntegration,
    });
  } catch (error) {
    return formatNoVibeMcpUnavailableResult({
      mcpUrl: noVibeMcpConfigurationResolution.configuration.mcpUrl,
      bearerToken: noVibeMcpConfigurationResolution.configuration.bearerToken,
      errorMessage: formatUnknownErrorMessage(error),
    });
  } finally {
    await disposeNoVibeMcpRuntimeIntegration(noVibeMcpRuntimeIntegration);
  }
}

async function createDefaultNoVibeMcpRuntimeIntegration(
  configuration: NoVibeMcpRuntimeIntegrationConfiguration,
): Promise<NoVibeMcpRuntimeIntegration> {
  const mcpModule = await import("@buli/mcp");
  return mcpModule.createNoVibeMcpRuntimeIntegration(configuration);
}

function formatInvalidNoVibeMcpConfigurationMessage(
  resolution: Extract<NoVibeMcpEnvironmentResolution, { status: "invalid" }>,
): string {
  switch (resolution.invalidReason) {
    case "missing_bearer_token":
      return INVALID_NOVIBE_MCP_MISSING_BEARER_TOKEN_MESSAGE;
    case "invalid_url":
      return INVALID_NOVIBE_MCP_URL_MESSAGE;
    case "invalid_timeout":
      return INVALID_NOVIBE_MCP_TIMEOUT_MESSAGE;
  }
}

function formatNoVibeMcpCheckResult(input: {
  configuration: NoVibeMcpRuntimeIntegrationConfiguration;
  runtimeIntegration: NoVibeMcpRuntimeIntegration;
}): string {
  const noVibeMcpServerStatus = resolveNoVibeMcpServerStatus(input.runtimeIntegration.serverStatuses);

  if (noVibeMcpServerStatus?.statusKind === "unavailable") {
    return formatNoVibeMcpUnavailableResult({
      mcpUrl: noVibeMcpServerStatus.url,
      bearerToken: input.configuration.bearerToken,
      errorMessage: noVibeMcpServerStatus.errorMessage,
    });
  }

  if (noVibeMcpServerStatus?.statusKind === "skipped") {
    return [
      `NoVibe MCP skipped: ${noVibeMcpServerStatus.url}`,
      `Reason: ${noVibeMcpServerStatus.reason}`,
    ].join("\n");
  }

  const toolNames = noVibeMcpServerStatus?.statusKind === "connected"
    ? noVibeMcpServerStatus.toolNames
    : input.runtimeIntegration.toolNames;
  const mcpUrl = noVibeMcpServerStatus?.statusKind === "connected"
    ? noVibeMcpServerStatus.url
    : input.configuration.mcpUrl;

  return formatNoVibeMcpConnectedResult({ mcpUrl, toolNames });
}

function resolveNoVibeMcpServerStatus(
  serverStatuses: readonly McpServerRuntimeStatus[],
): McpServerRuntimeStatus | undefined {
  return serverStatuses.find((serverStatus) => serverStatus.serverName === "novibe") ?? serverStatuses[0];
}

function formatNoVibeMcpConnectedResult(input: {
  mcpUrl: string;
  toolNames: readonly string[];
}): string {
  return [
    `NoVibe MCP connected: ${input.mcpUrl}`,
    `Tools (${input.toolNames.length}):`,
    ...input.toolNames.map((toolName) => `- ${toolName}`),
  ].join("\n");
}

function formatNoVibeMcpUnavailableResult(input: {
  mcpUrl: string;
  bearerToken: string;
  errorMessage: string;
}): string {
  return [
    `NoVibe MCP unavailable: ${input.mcpUrl}`,
    `Error: ${redactBearerToken({ text: input.errorMessage, bearerToken: input.bearerToken })}`,
  ].join("\n");
}

async function disposeNoVibeMcpRuntimeIntegration(
  runtimeIntegration: NoVibeMcpRuntimeIntegration | undefined,
): Promise<void> {
  try {
    await runtimeIntegration?.dispose();
  } catch {
    // The check command is a setup probe. A cleanup failure should not hide the
    // connection result, and the MCP runtime's normal disposer already uses
    // best-effort cleanup for SDK client/transport shutdown.
  }
}

function redactBearerToken(input: { text: string; bearerToken: string }): string {
  if (!input.bearerToken) {
    return input.text;
  }

  return input.text.split(input.bearerToken).join("[redacted]");
}

function formatUnknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
