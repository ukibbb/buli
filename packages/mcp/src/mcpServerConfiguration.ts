export type McpToolResultRetentionPolicy = "full" | "summary" | "redacted";
export type McpToolExecutionPolicy = "requires_user_approval" | "read_only_auto_approved";

export const DEFAULT_MCP_TOOL_EXECUTION_POLICY: McpToolExecutionPolicy = "requires_user_approval";

export type McpStreamableHttpHeader = Readonly<{
  name: string;
  value: string;
}>;

export type McpStreamableHttpServerConfiguration = Readonly<{
  serverName: string;
  displayName?: string | undefined;
  transport: "streamable_http";
  url: string;
  enabled?: boolean | undefined;
  timeoutMs: number;
  bearerToken?: string | undefined;
  headers?: readonly McpStreamableHttpHeader[] | undefined;
  toolResultRetention?: McpToolResultRetentionPolicy | undefined;
  toolExecutionPolicy?: McpToolExecutionPolicy | undefined;
}>;

export function resolveMcpToolExecutionPolicy(
  serverConfiguration: Pick<McpStreamableHttpServerConfiguration, "toolExecutionPolicy">,
): McpToolExecutionPolicy {
  return serverConfiguration.toolExecutionPolicy ?? DEFAULT_MCP_TOOL_EXECUTION_POLICY;
}

export type McpConnectedServerRuntimeStatus = Readonly<{
  statusKind: "connected";
  serverName: string;
  displayName: string;
  url: string;
  toolCount: number;
  toolNames: readonly string[];
}>;

export type McpUnavailableServerRuntimeStatus = Readonly<{
  statusKind: "unavailable";
  serverName: string;
  displayName: string;
  url: string;
  errorMessage: string;
}>;

export type McpSkippedServerRuntimeStatus = Readonly<{
  statusKind: "skipped";
  serverName: string;
  displayName: string;
  url: string;
  reason: "disabled";
}>;

export type McpServerRuntimeStatus =
  | McpConnectedServerRuntimeStatus
  | McpUnavailableServerRuntimeStatus
  | McpSkippedServerRuntimeStatus;
