import { expect, test } from "bun:test";
import {
  resolveDefaultAssistantProviderModelPromptProfile,
  resolveTaskSubagentProviderModelSelection,
} from "@buli/engine";
import {
  createMcpRuntimeIntegration,
  type ConnectedMcpServer,
  type McpStreamableHttpServerConfiguration,
} from "../src/index.ts";

test("createMcpRuntimeIntegration composes connected MCP servers and reports unavailable servers", async () => {
  const disposedServerNames: string[] = [];
  const serverConfigurations: readonly McpStreamableHttpServerConfiguration[] = [
    {
      serverName: "docs",
      displayName: "Docs",
      transport: "streamable_http",
      url: "http://localhost:9001/mcp",
      timeoutMs: 30_000,
    },
    {
      serverName: "offline",
      displayName: "Offline",
      transport: "streamable_http",
      url: "http://localhost:9002/mcp",
      timeoutMs: 30_000,
    },
    {
      serverName: "disabled",
      displayName: "Disabled",
      transport: "streamable_http",
      url: "http://localhost:9003/mcp",
      timeoutMs: 30_000,
      enabled: false,
    },
  ];

  const integration = await createMcpRuntimeIntegration({
    serverConfigurations,
    connectMcpServer: async (serverConfiguration): Promise<ConnectedMcpServer> => {
      if (serverConfiguration.serverName === "offline") {
        throw new Error("connection refused");
      }

      return {
        serverConfiguration,
        listedMcpTools: [{ name: "search", description: "Search docs." }],
        callMcpTool: async () => ({ content: [{ type: "text", text: "result" }] }),
        dispose: () => {
          disposedServerNames.push(serverConfiguration.serverName);
        },
      };
    },
  });

  expect(integration.toolNames).toEqual(["docs_search"]);
  expect(integration.serverStatuses).toEqual([
    {
      statusKind: "connected",
      serverName: "docs",
      displayName: "Docs",
      url: "http://localhost:9001/mcp",
      toolCount: 1,
      toolNames: ["docs_search"],
    },
    {
      statusKind: "unavailable",
      serverName: "offline",
      displayName: "Offline",
      url: "http://localhost:9002/mcp",
      errorMessage: "connection refused",
    },
    {
      statusKind: "skipped",
      serverName: "disabled",
      displayName: "Disabled",
      url: "http://localhost:9003/mcp",
      reason: "disabled",
    },
  ]);

  const primaryAgentCompositionResolver = integration.assistantRuntimeConfiguration.assistantRuntimeInput.primaryAssistantAgentCompositionResolver;
  if (!primaryAgentCompositionResolver) {
    throw new Error("expected MCP primary agent overlay resolver");
  }
  const understandAgent = integration.assistantRuntimeConfiguration.assistantAgentRegistry.resolvePrimaryAgentDefinition("understand");
  expect(primaryAgentCompositionResolver({
    registeredPrimaryAssistantAgent: understandAgent,
    providerName: "openai",
    selectedModelId: "test-model",
  }).primaryAssistantAgent.availableToolNames).toEqual(expect.arrayContaining(["docs_search"]));

  const taskSubagentCompositionResolver = integration.assistantRuntimeConfiguration.assistantRuntimeInput.taskSubagentCompositionResolver;
  if (!taskSubagentCompositionResolver) {
    throw new Error("expected MCP subagent overlay resolver");
  }
  const parentPrimaryAssistantAgent = integration.assistantRuntimeConfiguration.assistantAgentRegistry.resolvePrimaryAgentDefinition("understand");
  const exploreSubagent = integration.assistantRuntimeConfiguration.assistantAgentRegistry.resolveSubagentDefinition("explore");
  expect(taskSubagentCompositionResolver({
    registeredSubagent: exploreSubagent,
    parentPrimaryAssistantAgent,
    providerName: "openai",
    parentSelectedModelId: "test-parent-model",
    parentSelectedReasoningEffort: "medium",
    taskSubagentProviderModelSelection: resolveTaskSubagentProviderModelSelection({
      parentAssistantProviderName: "openai",
      parentSelectedModelId: "test-parent-model",
      parentSelectedReasoningEffort: "medium",
    }),
    defaultTaskSubagentAssistantProviderModelPromptProfile: resolveDefaultAssistantProviderModelPromptProfile({
      providerName: "openai",
      selectedModelId: "test-subagent-model",
    }),
  }).taskSubagent.availableToolNames).toEqual(expect.arrayContaining(["docs_search"]));

  await integration.dispose();
  expect(disposedServerNames).toEqual(["docs"]);
});
