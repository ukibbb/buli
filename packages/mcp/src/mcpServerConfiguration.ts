export type McpToolResultRetentionPolicy = "full" | "summary" | "redacted";

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
}>;

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
