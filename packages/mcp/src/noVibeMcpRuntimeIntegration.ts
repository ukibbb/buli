import type { McpToolResultRetentionPolicy } from "./mcpServerConfiguration.ts";
import {
  createMcpAssistantRuntimeConfiguration,
  createMcpRuntimeIntegration,
  type ConnectedMcpServer,
  type McpRuntimeIntegration,
} from "./mcpRuntimeIntegration.ts";
import type { CallMcpTool, ListedMcpToolDefinition } from "./mcpCustomAssistantTools.ts";

export type NoVibeMcpRuntimeIntegrationConfiguration = Readonly<{
  mcpUrl: string;
  bearerToken: string;
  timeoutMs: number;
  toolResultRetention?: McpToolResultRetentionPolicy | undefined;
}>;

export type NoVibeMcpRuntimeIntegration = McpRuntimeIntegration;

export type CreateNoVibeMcpAssistantRuntimeConfigurationInput = Readonly<{
  listedMcpTools: readonly ListedMcpToolDefinition[];
  callNoVibeMcpTool: CallMcpTool;
  dispose?: (() => Promise<void> | void) | undefined;
  toolResultRetention?: McpToolResultRetentionPolicy | undefined;
}>;

export async function createNoVibeMcpRuntimeIntegration(
  configuration: NoVibeMcpRuntimeIntegrationConfiguration,
): Promise<NoVibeMcpRuntimeIntegration> {
  return await createMcpRuntimeIntegration({
    serverConfigurations: [
      {
        serverName: "novibe",
        displayName: "NoVibe",
        transport: "streamable_http",
        url: configuration.mcpUrl,
        bearerToken: configuration.bearerToken,
        timeoutMs: configuration.timeoutMs,
        ...(configuration.toolResultRetention !== undefined
          ? { toolResultRetention: configuration.toolResultRetention }
          : {}),
      },
    ],
  });
}

export function createNoVibeMcpAssistantRuntimeConfiguration(
  input: CreateNoVibeMcpAssistantRuntimeConfigurationInput,
): NoVibeMcpRuntimeIntegration {
  return createMcpAssistantRuntimeConfiguration({
    connectedServers: [createConnectedNoVibeMcpServer(input)],
    dispose: input.dispose,
  });
}

function createConnectedNoVibeMcpServer(
  input: CreateNoVibeMcpAssistantRuntimeConfigurationInput,
): ConnectedMcpServer {
  return {
    serverConfiguration: {
      serverName: "novibe",
      displayName: "NoVibe",
      transport: "streamable_http",
      url: "http://localhost:8001/v1/mcp/",
      timeoutMs: 30_000,
      ...(input.toolResultRetention !== undefined ? { toolResultRetention: input.toolResultRetention } : {}),
    },
    listedMcpTools: input.listedMcpTools,
    callMcpTool: input.callNoVibeMcpTool,
    dispose: input.dispose ?? (() => {}),
  };
}

export type {
  CallMcpTool as CallNoVibeMcpTool,
  ListedMcpToolDefinition,
};
