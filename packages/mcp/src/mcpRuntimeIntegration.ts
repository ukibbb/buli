import type { ProviderAvailableToolName } from "@buli/contracts";
import {
  createAssistantRuntimeConfiguration,
  DEFAULT_ASSISTANT_SUBAGENT_DEFINITIONS,
  DEFAULT_PRIMARY_ASSISTANT_AGENT_DEFINITIONS,
  type AssistantRuntimeConfiguration,
} from "@buli/engine";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  createMcpCustomAssistantTools,
  type CallMcpTool,
  type ListedMcpToolDefinition,
  type McpToolCallResult,
  type McpToolResultContent,
} from "./mcpCustomAssistantTools.ts";
import type {
  McpServerRuntimeStatus,
  McpStreamableHttpServerConfiguration,
} from "./mcpServerConfiguration.ts";
import { resolveMcpToolExecutionPolicy } from "./mcpServerConfiguration.ts";

export type ConnectedMcpServer = Readonly<{
  serverConfiguration: McpStreamableHttpServerConfiguration;
  listedMcpTools: readonly ListedMcpToolDefinition[];
  callMcpTool: CallMcpTool;
  dispose: () => Promise<void> | void;
}>;

export type McpServerConnector = (
  serverConfiguration: McpStreamableHttpServerConfiguration,
) => Promise<ConnectedMcpServer>;

export type CreateMcpRuntimeIntegrationInput = Readonly<{
  serverConfigurations: readonly McpStreamableHttpServerConfiguration[];
  connectMcpServer?: McpServerConnector | undefined;
}>;

export type CreateMcpAssistantRuntimeConfigurationInput = Readonly<{
  connectedServers: readonly ConnectedMcpServer[];
  dispose?: (() => Promise<void> | void) | undefined;
}>;

export type McpRuntimeIntegration = Readonly<{
  assistantRuntimeConfiguration: AssistantRuntimeConfiguration;
  toolNames: readonly string[];
  serverStatuses: readonly McpServerRuntimeStatus[];
  dispose: () => Promise<void>;
}>;

const BULI_MCP_CLIENT_INFO = { name: "buli", version: "0.0.0" };
const MAX_MCP_LIST_PAGES = 1_000;

export async function createMcpRuntimeIntegration(
  input: CreateMcpRuntimeIntegrationInput,
): Promise<McpRuntimeIntegration> {
  const connectedServers: ConnectedMcpServer[] = [];
  const serverStatuses: McpServerRuntimeStatus[] = [];
  const connectMcpServer = input.connectMcpServer ?? connectStreamableHttpMcpServer;

  for (const serverConfiguration of input.serverConfigurations) {
    if (serverConfiguration.enabled === false) {
      serverStatuses.push({
        statusKind: "skipped",
        serverName: serverConfiguration.serverName,
        displayName: resolveMcpServerDisplayName(serverConfiguration),
        url: serverConfiguration.url,
        reason: "disabled",
      });
      continue;
    }

    try {
      const connectedServer = await connectMcpServer(serverConfiguration);
      connectedServers.push(connectedServer);
    } catch (error) {
      serverStatuses.push({
        statusKind: "unavailable",
        serverName: serverConfiguration.serverName,
        displayName: resolveMcpServerDisplayName(serverConfiguration),
        url: serverConfiguration.url,
        errorMessage: formatUnknownErrorMessage(error),
      });
    }
  }

  const assistantRuntimeIntegration = createMcpAssistantRuntimeConfiguration({
    connectedServers,
    dispose: async () => {
      await Promise.allSettled(connectedServers.map((connectedServer) => connectedServer.dispose()));
    },
  });
  const connectedServerStatuses = connectedServers.map((connectedServer) => ({
    statusKind: "connected" as const,
    serverName: connectedServer.serverConfiguration.serverName,
    displayName: resolveMcpServerDisplayName(connectedServer.serverConfiguration),
    url: connectedServer.serverConfiguration.url,
    toolCount: connectedServer.listedMcpTools.length,
    toolNames: assistantRuntimeIntegration.toolNamesByServerName.get(connectedServer.serverConfiguration.serverName) ?? [],
  }));

  return {
    assistantRuntimeConfiguration: assistantRuntimeIntegration.assistantRuntimeConfiguration,
    toolNames: assistantRuntimeIntegration.toolNames,
    serverStatuses: [...connectedServerStatuses, ...serverStatuses],
    dispose: assistantRuntimeIntegration.dispose,
  };
}

export function createMcpAssistantRuntimeConfiguration(
  input: CreateMcpAssistantRuntimeConfigurationInput,
): McpRuntimeIntegration & Readonly<{ toolNamesByServerName: ReadonlyMap<string, readonly string[]> }> {
  const customAssistantToolDefinitionsByServer = input.connectedServers.map((connectedServer) => {
    const toolExecutionPolicy = resolveMcpToolExecutionPolicy(connectedServer.serverConfiguration);
    const customAssistantToolDefinitions = createMcpCustomAssistantTools({
      serverName: connectedServer.serverConfiguration.serverName,
      serverDisplayName: connectedServer.serverConfiguration.displayName,
      listedMcpTools: connectedServer.listedMcpTools,
      callMcpTool: connectedServer.callMcpTool,
      toolResultRetention: connectedServer.serverConfiguration.toolResultRetention,
      toolExecutionPolicy,
    });

    return {
      serverName: connectedServer.serverConfiguration.serverName,
      toolExecutionPolicy,
      customAssistantToolDefinitions,
      customToolNames: customAssistantToolDefinitions.map((customToolDefinition) => customToolDefinition.toolName),
    };
  });
  const customAssistantToolDefinitions = customAssistantToolDefinitionsByServer.flatMap((serverCustomTools) =>
    serverCustomTools.customAssistantToolDefinitions
  );
  const mcpToolNames = customAssistantToolDefinitionsByServer.flatMap((serverCustomTools) => serverCustomTools.customToolNames);
  const autoApprovedReadOnlyMcpToolNames = customAssistantToolDefinitionsByServer.flatMap((serverCustomTools) =>
    serverCustomTools.toolExecutionPolicy === "read_only_auto_approved" ? serverCustomTools.customToolNames : []
  );
  const toolNamesByServerName = new Map<string, readonly string[]>();
  for (const serverCustomTools of customAssistantToolDefinitionsByServer) {
    toolNamesByServerName.set(serverCustomTools.serverName, serverCustomTools.customToolNames);
  }
  const assistantRuntimeConfiguration = createAssistantRuntimeConfiguration({
    additionalCustomTools: customAssistantToolDefinitions,
    ...(mcpToolNames.length > 0
      ? {
          modelOverlays: [
            {
              overlayName: "mcp-tools",
              matchesTurn: () => true,
              primaryAgentOverlays: DEFAULT_PRIMARY_ASSISTANT_AGENT_DEFINITIONS.map((primaryAssistantAgent) => ({
                agentName: primaryAssistantAgent.agentName,
                availableToolNames: appendUniqueProviderToolNames({
                  baselineToolNames: primaryAssistantAgent.availableToolNames,
                  additionalToolNames: mcpToolNames,
                }),
              })),
              taskSubagentOverlays: DEFAULT_ASSISTANT_SUBAGENT_DEFINITIONS.map((taskSubagent) => ({
                subagentName: taskSubagent.subagentName,
                availableToolNames: appendUniqueProviderToolNames({
                  baselineToolNames: taskSubagent.availableToolNames,
                  additionalToolNames: autoApprovedReadOnlyMcpToolNames,
                }),
              })),
            },
          ],
        }
      : {}),
  });

  return {
    assistantRuntimeConfiguration,
    toolNames: mcpToolNames,
    serverStatuses: [],
    toolNamesByServerName,
    dispose: async () => {
      await input.dispose?.();
    },
  };
}

export async function connectStreamableHttpMcpServer(
  serverConfiguration: McpStreamableHttpServerConfiguration,
): Promise<ConnectedMcpServer> {
  const client = new Client(BULI_MCP_CLIENT_INFO);
  const transport = new StreamableHTTPClientTransport(new URL(serverConfiguration.url), {
    requestInit: {
      headers: createStreamableHttpMcpRequestHeaders(serverConfiguration),
    },
  });

  try {
    await withTimeout(
      client.connect(asExactOptionalCompatibleMcpTransport(transport)),
      serverConfiguration.timeoutMs,
      `${resolveMcpServerDisplayName(serverConfiguration)} MCP connect to ${serverConfiguration.url}`,
    );
    const listedMcpTools = await listMcpToolsWithPagination({
      client,
      serverDisplayName: resolveMcpServerDisplayName(serverConfiguration),
      timeoutMs: serverConfiguration.timeoutMs,
    });

    return {
      serverConfiguration,
      listedMcpTools,
      callMcpTool: createMcpToolCaller({ client, timeoutMs: serverConfiguration.timeoutMs }),
      dispose: async () => {
        await closeMcpClientAndTransport({ client, transport });
      },
    };
  } catch (error) {
    await closeMcpClientAndTransport({ client, transport });
    throw error;
  }
}

function resolveMcpServerDisplayName(serverConfiguration: McpStreamableHttpServerConfiguration): string {
  return serverConfiguration.displayName?.trim() || serverConfiguration.serverName;
}

function createStreamableHttpMcpRequestHeaders(
  serverConfiguration: McpStreamableHttpServerConfiguration,
): Record<string, string> {
  const requestHeaders = Object.fromEntries(
    (serverConfiguration.headers ?? []).map((header) => [header.name, header.value]),
  );
  if (!serverConfiguration.bearerToken) {
    return requestHeaders;
  }

  return {
    ...requestHeaders,
    Authorization: `Bearer ${serverConfiguration.bearerToken}`,
  };
}

function asExactOptionalCompatibleMcpTransport(transport: StreamableHTTPClientTransport): Transport {
  // The SDK transport implements the Transport runtime contract, but its declaration exposes
  // `sessionId` as `string | undefined` while the interface declares `sessionId?: string`.
  // With `exactOptionalPropertyTypes` enabled those two shapes are not assignable, so keep the
  // cast isolated at the SDK boundary instead of loosening project-wide strictness.
  return transport as unknown as Transport;
}

function createMcpToolCaller(input: {
  client: Client;
  timeoutMs: number;
}): CallMcpTool {
  return async (toolCallInput) => {
    const mcpToolCallResult = await input.client.callTool(
      {
        name: toolCallInput.mcpToolName,
        arguments: { ...toolCallInput.argumentsJson },
      },
      CallToolResultSchema,
      {
        timeout: input.timeoutMs,
        signal: toolCallInput.abortSignal,
        resetTimeoutOnProgress: true,
        onprogress: () => {},
      },
    );

    return convertMcpSdkToolCallResult(mcpToolCallResult);
  };
}

async function listMcpToolsWithPagination(input: {
  client: Client;
  serverDisplayName: string;
  timeoutMs: number;
}): Promise<readonly ListedMcpToolDefinition[]> {
  const listedMcpTools: ListedMcpToolDefinition[] = [];
  const seenCursors = new Set<string>();
  let nextCursor: string | undefined;

  for (let pageNumber = 0; pageNumber < MAX_MCP_LIST_PAGES; pageNumber += 1) {
    const listToolsResult = await input.client.listTools(
      nextCursor === undefined ? undefined : { cursor: nextCursor },
      { timeout: input.timeoutMs },
    );

    listedMcpTools.push(...listToolsResult.tools.map((mcpTool) => ({
      name: mcpTool.name,
      ...(mcpTool.description !== undefined ? { description: mcpTool.description } : {}),
      inputSchema: mcpTool.inputSchema,
    })));

    if (listToolsResult.nextCursor === undefined) {
      return listedMcpTools;
    }
    if (seenCursors.has(listToolsResult.nextCursor)) {
      throw new Error(`${input.serverDisplayName} MCP tools/list returned duplicate cursor: ${listToolsResult.nextCursor}`);
    }

    seenCursors.add(listToolsResult.nextCursor);
    nextCursor = listToolsResult.nextCursor;
  }

  throw new Error(`${input.serverDisplayName} MCP tools/list exceeded ${MAX_MCP_LIST_PAGES} pages.`);
}

function appendUniqueProviderToolNames(input: {
  baselineToolNames: readonly ProviderAvailableToolName[];
  additionalToolNames: readonly ProviderAvailableToolName[];
}): readonly ProviderAvailableToolName[] {
  const observedToolNames = new Set(input.baselineToolNames);
  const effectiveToolNames = [...input.baselineToolNames];
  for (const additionalToolName of input.additionalToolNames) {
    if (observedToolNames.has(additionalToolName)) {
      continue;
    }

    observedToolNames.add(additionalToolName);
    effectiveToolNames.push(additionalToolName);
  }

  return effectiveToolNames;
}

function convertMcpSdkToolCallResult(mcpSdkToolCallResult: unknown): McpToolCallResult {
  if (!isJsonRecord(mcpSdkToolCallResult)) {
    return {
      isError: true,
      content: [{ type: "text", text: "MCP server returned a malformed tool result." }],
    };
  }

  const content = listMcpToolResultContentRecords(mcpSdkToolCallResult["content"]);
  return {
    ...(content.length > 0 ? { content } : {}),
    ...(mcpSdkToolCallResult["structuredContent"] !== undefined
      ? { structuredContent: mcpSdkToolCallResult["structuredContent"] }
      : {}),
    ...(typeof mcpSdkToolCallResult["isError"] === "boolean" ? { isError: mcpSdkToolCallResult["isError"] } : {}),
  };
}

function listMcpToolResultContentRecords(contentValue: unknown): readonly McpToolResultContent[] {
  if (!Array.isArray(contentValue)) {
    return [];
  }

  return contentValue.filter(isJsonRecord);
}

async function closeMcpClientAndTransport(input: {
  client: Client;
  transport: StreamableHTTPClientTransport;
}): Promise<void> {
  await Promise.allSettled([
    input.client.close(),
    input.transport.close(),
  ]);
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, operationLabel: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationLabel} timed out after ${timeoutMs} ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function formatUnknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isJsonRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
