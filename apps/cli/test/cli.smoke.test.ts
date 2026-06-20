import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type {
  ConversationSessionEntry,
  ConversationSessionModelSelection,
  ConversationSessionSummary,
  ReasoningEffort,
} from "@buli/contracts";
import {
  AssistantConversationRuntime,
  EMPTY_ASSISTANT_PROVIDER_MODEL_PROMPT_FRAGMENTS,
  createAssistantRuntimeConfiguration,
  type ConversationAutoCompactionRequest,
  type ConversationAutoCompactionResult,
  type ConversationCompactionRequest,
  createDefaultAssistantAgentRegistry,
  createDefaultAssistantToolRegistry,
  type AssistantProviderModelPromptProfileResolver,
  type BuiltInToolDescriptionOverlayResolver,
  type PrimaryAssistantAgentCompositionResolver,
  type TaskSubagentCompositionResolver,
  type CustomAssistantToolDefinition,
  type PrimaryAssistantAgentDefinition,
} from "@buli/engine";
import {
  createMcpAssistantRuntimeConfiguration,
  type CreateMcpRuntimeIntegrationInput,
  type McpRuntimeIntegration,
} from "@buli/mcp";
import { OpenAiAuthStore, OpenAiProvider, type OpenAiModelBehaviorProfileResolver } from "@buli/openai";
import type {
  ConversationSessionDeleteResult,
  ConversationSessionSwitchResult,
  RenderChatScreenInTerminalInput,
} from "@buli/tui";
import { main } from "../src/cli.ts";
import { runInteractiveChat } from "../src/commands/chat.ts";
import { runLogin } from "../src/commands/login.ts";
import { runCheckNoVibeMcp } from "../src/commands/mcp.ts";
import {
  defaultConversationSessionDatabasePath,
  SqliteConversationSessionStore,
  type ConversationSessionStore,
} from "../src/conversationSession/index.ts";
import { runListAvailableModels } from "../src/commands/models.ts";
import { type InteractiveChatStartOptions, runCli, USAGE } from "../src/main.ts";

const CLI_USAGE = USAGE;

test("runCli delegates the login command", async () => {
  const output = await runCli(["login"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runCheckNoVibeMcp: async () => "delegated mcp check",
    runLogin: async () => "delegated login",
  });

  expect(output).toEqual({ status: "ok", output: "delegated login" });
});

test("runCli delegates the models command", async () => {
  const output = await runCli(["models"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runCheckNoVibeMcp: async () => "delegated mcp check",
    runLogin: async () => "delegated login",
  });

  expect(output).toEqual({ status: "ok", output: "delegated models" });
});

test("runCli delegates the mcp check command", async () => {
  const output = await runCli(["mcp", "check"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runCheckNoVibeMcp: async () => "delegated mcp check",
    runLogin: async () => "delegated login",
  });

  expect(output).toEqual({ status: "ok", output: "delegated mcp check" });
});

test("runCli returns usage for invalid mcp subcommands", async () => {
  const output = await runCli(["mcp", "unknown"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runCheckNoVibeMcp: async () => "delegated mcp check",
    runLogin: async () => "delegated login",
  });

  expect(output).toEqual({ status: "usage_error", output: CLI_USAGE });
});

test("runCli returns usage for unknown commands", async () => {
  const output = await runCli(["unknown"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runCheckNoVibeMcp: async () => "delegated mcp check",
    runLogin: async () => "delegated login",
  });

  expect(output).toEqual({ status: "usage_error", output: CLI_USAGE });
});

test("runCli delegates the default command when no args are provided", async () => {
  let received = {};

  const output = await runCli([], {
    runInteractiveChat: async (input) => {
      received = input ?? {};
      return "delegated start";
    },
    runListAvailableModels: async () => "delegated models",
    runCheckNoVibeMcp: async () => "delegated mcp check",
    runLogin: async () => "delegated login",
  });

  expect(received).toEqual({});
  expect(output).toEqual({ status: "ok", output: "delegated start" });
});

test("runCli returns usage for the removed chat alias", async () => {
  const output = await runCli(["chat"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runCheckNoVibeMcp: async () => "delegated mcp check",
    runLogin: async () => "delegated login",
  });

  expect(output).toEqual({ status: "usage_error", output: CLI_USAGE });
});

test("runCli passes startup flags to the chat command", async () => {
  let received = {};

  const output = await runCli(["--model", "gpt-5.4", "--reasoning", "high"], {
    runInteractiveChat: async (input) => {
      received = input ?? {};
      return "delegated start";
    },
    runListAvailableModels: async () => "delegated models",
    runCheckNoVibeMcp: async () => "delegated mcp check",
    runLogin: async () => "delegated login",
  });

  expect(received).toEqual({ selectedModelId: "gpt-5.4", selectedReasoningEffort: "high" });
  expect(output).toEqual({ status: "ok", output: "delegated start" });
});

test("runCli passes the bash approval startup flag to the chat command", async () => {
  let received: InteractiveChatStartOptions = {};

  const output = await runCli(["--bash-approval", "trusted"], {
    runInteractiveChat: async (input) => {
      received = input ?? {};
      return "delegated start";
    },
    runListAvailableModels: async () => "delegated models",
    runCheckNoVibeMcp: async () => "delegated mcp check",
    runLogin: async () => "delegated login",
  });

  expect(received).toEqual({ bashToolApprovalMode: "trusted" });
  expect(output).toEqual({ status: "ok", output: "delegated start" });
});

test("runCli returns usage when a startup flag is invalid", async () => {
  const output = await runCli(["--reasoning", "wrong"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runCheckNoVibeMcp: async () => "delegated mcp check",
    runLogin: async () => "delegated login",
  });

  expect(output).toEqual({ status: "usage_error", output: CLI_USAGE });
});

test("runCli returns usage successfully for help", async () => {
  const output = await runCli(["--help"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runCheckNoVibeMcp: async () => "delegated mcp check",
    runLogin: async () => "delegated login",
  });

  expect(output).toEqual({ status: "ok", output: CLI_USAGE });
});

test("runCheckNoVibeMcp reports that NoVibe MCP is disabled by default", async () => {
  await expect(runCheckNoVibeMcp({ environment: {} })).resolves.toBe([
    "NoVibe MCP is disabled.",
    "Set BULI_NOVIBE_MCP_BEARER_TOKEN to enable it.",
  ].join("\n"));
});

test("runCheckNoVibeMcp reports invalid NoVibe MCP environment", async () => {
  await expect(runCheckNoVibeMcp({
    environment: { BULI_NOVIBE_MCP_URL: "http://localhost:8001/v1/mcp/" },
  })).resolves.toBe(
    "Invalid NoVibe MCP configuration. Set BULI_NOVIBE_MCP_BEARER_TOKEN when BULI_NOVIBE_MCP_URL or BULI_NOVIBE_MCP_TIMEOUT_MS is configured.",
  );
  await expect(runCheckNoVibeMcp({
    environment: {
      BULI_NOVIBE_MCP_BEARER_TOKEN: "raw-dev-token",
      BULI_NOVIBE_MCP_URL: "not-a-url",
    },
  })).resolves.toBe("Invalid BULI_NOVIBE_MCP_URL. Use an absolute http(s) URL.");
});

test("runCheckNoVibeMcp reports connected NoVibe MCP tools and disposes the integration", async () => {
  let capturedMcpConfiguration: { mcpUrl: string; bearerToken: string; timeoutMs: number } | undefined;
  let disposeCount = 0;

  const output = await runCheckNoVibeMcp({
    environment: { BULI_NOVIBE_MCP_BEARER_TOKEN: " raw-dev-token " },
    createNoVibeMcpRuntimeIntegration: async (configuration) => {
      capturedMcpConfiguration = configuration;
      return createFakeMcpRuntimeIntegration({
        toolNames: [
          "novibe_teacher_library_read_current_learning_area_tree",
          "novibe_teacher_library_note_read",
        ],
        serverStatuses: [{
          statusKind: "connected",
          serverName: "novibe",
          displayName: "NoVibe",
          url: configuration.mcpUrl,
          toolCount: 2,
          toolNames: [
            "novibe_teacher_library_read_current_learning_area_tree",
            "novibe_teacher_library_note_read",
          ],
        }],
        dispose: () => {
          disposeCount += 1;
        },
      });
    },
  });

  expect(capturedMcpConfiguration).toEqual({
    mcpUrl: "http://localhost:8001/v1/mcp/",
    bearerToken: "raw-dev-token",
    timeoutMs: 30_000,
  });
  expect(output).toBe([
    "NoVibe MCP connected: http://localhost:8001/v1/mcp/",
    "Tools (2):",
    "- novibe_teacher_library_read_current_learning_area_tree",
    "- novibe_teacher_library_note_read",
  ].join("\n"));
  expect(output).not.toContain("raw-dev-token");
  expect(disposeCount).toBe(1);
});

test("runCheckNoVibeMcp reports unavailable NoVibe MCP without leaking the bearer token", async () => {
  const output = await runCheckNoVibeMcp({
    environment: { BULI_NOVIBE_MCP_BEARER_TOKEN: "raw-dev-token" },
    createNoVibeMcpRuntimeIntegration: async () => {
      throw new Error("NoVibe MCP raw-dev-token server is offline");
    },
  });

  expect(output).toBe([
    "NoVibe MCP unavailable: http://localhost:8001/v1/mcp/",
    "Error: NoVibe MCP [redacted] server is offline",
  ].join("\n"));
});

test("runLogin can use an injected browser login dependency", async () => {
  await expect(runLogin({
    loginWithBrowser: async () => ({
      provider: "openai",
      method: "oauth",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 60_000,
      accountId: "acct_test",
    }),
  })).resolves.toBe("OpenAI login complete for account acct_test");
});

test("runInteractiveChat returns a clean message when auth is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await expect(runInteractiveChat({ store, environment: {} })).resolves.toBe("OpenAI auth not found. Run `buli login`.");
});

test("runInteractiveChat returns a clean message when stdin is not a TTY", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  await expect(runInteractiveChat({ store, stdin: { isTTY: false }, environment: {} })).resolves.toBe(
    "Interactive chat requires a TTY. Run `buli` in a terminal.",
  );
});

test("runInteractiveChat returns a clean message when bash approval environment is invalid", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await expect(runInteractiveChat({ store, environment: { BULI_BASH_APPROVAL_MODE: "wrong" } })).resolves.toBe(
    "Invalid BULI_BASH_APPROVAL_MODE. Use `risk_based` or `trusted`.",
  );
});

test("runInteractiveChat returns a clean message when provider host command environment is invalid", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-provider-command-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await expect(runInteractiveChat({ store, environment: { BULI_PROVIDER_HOST_COMMAND: "not-json" } })).resolves.toBe(
    "Invalid BULI_PROVIDER_HOST_COMMAND. Use a JSON string array like [\"/path/to/provider\"].",
  );
});

test("runInteractiveChat returns a clean message when auto-compaction threshold environment is invalid", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await expect(runInteractiveChat({ store, environment: { BULI_AUTO_COMPACT_THRESHOLD: "wrong" } })).resolves.toBe(
    "Invalid BULI_AUTO_COMPACT_THRESHOLD. Use a number from 0 through 1.",
  );
});

test("runInteractiveChat returns clean messages for invalid concurrency environment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await expect(runInteractiveChat({ store, environment: { BULI_READ_ONLY_TOOL_CONCURRENCY: "0" } })).resolves.toBe(
    "Invalid BULI_READ_ONLY_TOOL_CONCURRENCY. Use a positive integer.",
  );
  await expect(runInteractiveChat({ store, environment: { BULI_SUBAGENT_CONCURRENCY: "1.5" } })).resolves.toBe(
    "Invalid BULI_SUBAGENT_CONCURRENCY. Use a positive integer.",
  );
  await expect(runInteractiveChat({ store, environment: { BULI_OPENAI_MAX_CONCURRENT_STREAMS: "wrong" } })).resolves.toBe(
    "Invalid BULI_OPENAI_MAX_CONCURRENT_STREAMS. Use a positive integer.",
  );
});

test("runInteractiveChat returns a clean message when task subagent reasoning environment is invalid", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-task-subagent-env-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await expect(runInteractiveChat({
    store,
    environment: { BULI_TASK_SUBAGENT_MAX_REASONING_EFFORT: "extreme" },
  })).resolves.toBe(
    "Invalid BULI_TASK_SUBAGENT_MAX_REASONING_EFFORT. Use none, minimal, low, medium, high, or xhigh.",
  );
});

test("runInteractiveChat returns a clean message when task subagent elapsed-time checkpoint environment is invalid", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-task-subagent-elapsed-env-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await expect(runInteractiveChat({
    store,
    environment: { BULI_TASK_SUBAGENT_SOFT_ELAPSED_TIME_CHECKPOINT_MS: "0" },
  })).resolves.toBe(
    "Invalid BULI_TASK_SUBAGENT_SOFT_ELAPSED_TIME_CHECKPOINT_MS. Use a positive integer number of milliseconds.",
  );
});

test("runInteractiveChat applies concurrency and task subagent environment overrides", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-concurrency-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const conversationSessionStoreStub = createConversationSessionStoreStub({ directoryPath: dir });
  let capturedConversationRuntime: AssistantConversationRuntime | undefined;

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  const output = await runInteractiveChat({
    store,
    conversationSessionStore: conversationSessionStoreStub.conversationSessionStore,
    stdin: { isTTY: true },
    environment: {
      BULI_READ_ONLY_TOOL_CONCURRENCY: "11",
      BULI_SUBAGENT_CONCURRENCY: "5",
      BULI_OPENAI_MAX_CONCURRENT_STREAMS: "7",
      BULI_TASK_SUBAGENT_SOFT_ELAPSED_TIME_CHECKPOINT_MS: "300000",
      BULI_TASK_SUBAGENT_MODEL: "gpt-5.4-mini",
      BULI_TASK_SUBAGENT_MAX_REASONING_EFFORT: "low",
    },
    renderChatScreen: async (renderInput) => {
      capturedConversationRuntime = renderInput.assistantConversationRunner as AssistantConversationRuntime;
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  });

  expect(output).toBe("");
  expect(capturedConversationRuntime?.maximumConcurrentReadOnlyToolCalls).toBe(11);
  expect(capturedConversationRuntime?.maximumConcurrentSubagentConversations).toBe(5);
  expect(capturedConversationRuntime?.taskSubagentSoftElapsedTimeCheckpointMilliseconds).toBe(300_000);
  expect(capturedConversationRuntime?.taskSubagentProviderModelSelectionPolicy).toEqual({
    selectedModelIdOverride: "gpt-5.4-mini",
    maximumReasoningEffort: "low",
  });
  const conversationTurnProvider = capturedConversationRuntime?.conversationTurnProvider;
  if (!(conversationTurnProvider instanceof OpenAiProvider)) {
    throw new Error("expected direct OpenAI provider");
  }
  expect(conversationTurnProvider.rateLimitCoordinator.maximumConcurrentResponseStepStreams).toBe(7);
});

test("runInteractiveChat applies code-provided registries and model profile resolvers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-code-config-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const conversationSessionStoreStub = createConversationSessionStoreStub({ directoryPath: dir });
  const customToolName = "project_status";
  const customAssistantToolDefinition = {
    toolName: customToolName,
    providerToolDefinition: {
      toolName: customToolName,
      description: "Summarize the current project status.",
      parameters: {
        type: "object",
        properties: {
          includeRisks: {
            type: "boolean",
            description: "Whether to include known risks in the summary.",
          },
        },
        required: ["includeRisks"],
        additionalProperties: false,
      },
    },
    executionPolicy: {
      workspaceEffectKind: "read_only",
      isAutoConcurrent: false,
      isAutoApprovedReadOnly: false,
      clearsSameTurnReadCoverageBeforeExecution: false,
    },
    executor: async () => ({
      outcomeKind: "completed",
      toolResultText: "Project status is available.",
    }),
  } satisfies CustomAssistantToolDefinition;
  const customPrimaryAgentDefinition = {
    agentName: "status",
    displayName: "Status Agent",
    shortLabel: "Status",
    description: "Uses a code-registered status tool.",
    accentColorName: "cyan",
    isReadOnly: true,
    availableToolNames: [customToolName],
    systemPromptConfiguration: {
      promptConfigurationKind: "custom",
      systemReminderText: "Use the project status tool when status is requested.",
    },
  } satisfies PrimaryAssistantAgentDefinition;
  const assistantToolRegistry = createDefaultAssistantToolRegistry({
    additionalCustomTools: [customAssistantToolDefinition],
  });
  const assistantAgentRegistry = createDefaultAssistantAgentRegistry({
    additionalPrimaryAgents: [customPrimaryAgentDefinition],
  });
  const assistantProviderModelPromptProfileResolver: AssistantProviderModelPromptProfileResolver = (resolverInput) => ({
    profileId: `test-prompt-profile:${resolverInput.providerName}:${resolverInput.selectedModelId}`,
    providerName: resolverInput.providerName,
    selectedModelId: resolverInput.selectedModelId,
    promptFragments: EMPTY_ASSISTANT_PROVIDER_MODEL_PROMPT_FRAGMENTS,
    stickyNotes: {
      maximumRelevantEvidenceNoteCount: 1,
      maximumPromptNoteTextCharacterCount: 2,
      maximumObservationTextCharacterCount: 3,
    },
    workflowHandoff: {
      renderingDetail: "compact",
      maximumListItemCount: 4,
      maximumTextCharacterCount: 5,
    },
  });
  const primaryAssistantAgentCompositionResolver: PrimaryAssistantAgentCompositionResolver = (resolverInput) => ({
    primaryAssistantAgent: resolverInput.registeredPrimaryAssistantAgent,
    assistantProviderModelPromptProfile: {
      profileId: `test-composed-profile:${resolverInput.providerName}:${resolverInput.selectedModelId}`,
      providerName: resolverInput.providerName,
      selectedModelId: resolverInput.selectedModelId,
      promptFragments: EMPTY_ASSISTANT_PROVIDER_MODEL_PROMPT_FRAGMENTS,
      stickyNotes: {
        maximumRelevantEvidenceNoteCount: 6,
        maximumPromptNoteTextCharacterCount: 7,
        maximumObservationTextCharacterCount: 8,
      },
      workflowHandoff: {
        renderingDetail: "compact",
        maximumListItemCount: 9,
        maximumTextCharacterCount: 10,
      },
    },
  });
  const taskSubagentCompositionResolver: TaskSubagentCompositionResolver = (resolverInput) => ({
    taskSubagent: resolverInput.registeredSubagent,
    assistantProviderModelPromptProfile: {
      ...resolverInput.defaultTaskSubagentAssistantProviderModelPromptProfile,
      profileId:
        `test-task-subagent-profile:${resolverInput.providerName}:${resolverInput.taskSubagentProviderModelSelection.taskSubagentSelectedModelId}`,
    },
  });
  const builtInToolDescriptionOverlayResolver: BuiltInToolDescriptionOverlayResolver = (resolverInput) => [
    {
      toolName: "read",
      additionalDescriptionParagraphs: [
        `test-built-in-tool-description:${resolverInput.providerName}:${resolverInput.selectedModelId}`,
      ],
    },
  ];
  const openAiModelBehaviorProfileResolver: OpenAiModelBehaviorProfileResolver = (resolverInput) => ({
    profileId: `test-openai-profile:${resolverInput.selectedModelId}`,
    requestReasoningSummary: false,
    requestLowTextVerbosity: true,
    allowParallelToolCalls: false,
    defaultReasoningEncryptedContentInclusionPolicy: "when_input_contains_reasoning",
  });
  let capturedConversationRuntime: AssistantConversationRuntime | undefined;
  let capturedPrimaryAgentDisplayMetadata:
    | ReturnType<AssistantConversationRuntime["listPrimaryAgentDisplayMetadata"]>
    | undefined;

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  const output = await runInteractiveChat({
    store,
    conversationSessionStore: conversationSessionStoreStub.conversationSessionStore,
    stdin: { isTTY: true },
    environment: {},
    assistantAgentRegistry,
    assistantToolRegistry,
    assistantProviderModelPromptProfileResolver,
    primaryAssistantAgentCompositionResolver,
    taskSubagentCompositionResolver,
    builtInToolDescriptionOverlayResolver,
    openAiModelBehaviorProfileResolver,
    renderChatScreen: async (renderInput) => {
      capturedConversationRuntime = renderInput.assistantConversationRunner as AssistantConversationRuntime;
      capturedPrimaryAgentDisplayMetadata = renderInput.primaryAgentDisplayMetadata;
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  });

  expect(output).toBe("");
  expect(capturedConversationRuntime?.assistantAgentRegistry).toBe(assistantAgentRegistry);
  expect(capturedConversationRuntime?.assistantToolRegistry).toBe(assistantToolRegistry);
  expect(capturedConversationRuntime?.assistantToolRegistry.resolveCustomToolDefinition(customToolName)).toBe(
    customAssistantToolDefinition,
  );
  expect(capturedConversationRuntime?.assistantProviderModelPromptProfileResolver({
    providerName: "openai",
    selectedModelId: "custom-prompt-model",
  })).toEqual({
    profileId: "test-prompt-profile:openai:custom-prompt-model",
    providerName: "openai",
    selectedModelId: "custom-prompt-model",
    promptFragments: EMPTY_ASSISTANT_PROVIDER_MODEL_PROMPT_FRAGMENTS,
    stickyNotes: {
      maximumRelevantEvidenceNoteCount: 1,
      maximumPromptNoteTextCharacterCount: 2,
      maximumObservationTextCharacterCount: 3,
    },
    workflowHandoff: {
      renderingDetail: "compact",
      maximumListItemCount: 4,
      maximumTextCharacterCount: 5,
    },
  });
  expect(capturedConversationRuntime?.primaryAssistantAgentCompositionResolver).toBe(
    primaryAssistantAgentCompositionResolver,
  );
  expect(capturedConversationRuntime?.primaryAssistantAgentCompositionResolver({
    registeredPrimaryAssistantAgent: customPrimaryAgentDefinition,
    providerName: "openai",
    selectedModelId: "custom-composed-model",
    selectedReasoningEffort: "high",
  })).toEqual({
    primaryAssistantAgent: customPrimaryAgentDefinition,
    assistantProviderModelPromptProfile: {
      profileId: "test-composed-profile:openai:custom-composed-model",
      providerName: "openai",
      selectedModelId: "custom-composed-model",
      promptFragments: EMPTY_ASSISTANT_PROVIDER_MODEL_PROMPT_FRAGMENTS,
      stickyNotes: {
        maximumRelevantEvidenceNoteCount: 6,
        maximumPromptNoteTextCharacterCount: 7,
        maximumObservationTextCharacterCount: 8,
      },
      workflowHandoff: {
        renderingDetail: "compact",
        maximumListItemCount: 9,
        maximumTextCharacterCount: 10,
      },
    },
  });
  expect(capturedConversationRuntime?.taskSubagentCompositionResolver).toBe(taskSubagentCompositionResolver);
  expect(capturedConversationRuntime?.taskSubagentCompositionResolver({
    registeredSubagent: assistantAgentRegistry.resolveSubagentDefinition("explore"),
    parentPrimaryAssistantAgent: customPrimaryAgentDefinition,
    providerName: "openai",
    parentSelectedModelId: "custom-parent-model",
    parentSelectedReasoningEffort: "high",
    taskSubagentProviderModelSelection: {
      taskSubagentSelectedModelId: "custom-subagent-model",
      taskSubagentSelectedReasoningEffort: "low",
      modelSelectionReason: "policy_model_override",
      reasoningEffortSelectionReason: "clamped_to_policy_maximum",
    },
    defaultTaskSubagentAssistantProviderModelPromptProfile: {
      profileId: "default-task-subagent-profile",
      providerName: "openai",
      selectedModelId: "custom-subagent-model",
      promptFragments: EMPTY_ASSISTANT_PROVIDER_MODEL_PROMPT_FRAGMENTS,
      stickyNotes: {
        maximumRelevantEvidenceNoteCount: 1,
        maximumPromptNoteTextCharacterCount: 2,
        maximumObservationTextCharacterCount: 3,
      },
      workflowHandoff: {
        renderingDetail: "compact",
        maximumListItemCount: 4,
        maximumTextCharacterCount: 5,
      },
    },
  }).assistantProviderModelPromptProfile.profileId).toBe(
    "test-task-subagent-profile:openai:custom-subagent-model",
  );
  expect(capturedConversationRuntime?.builtInToolDescriptionOverlayResolver).toBe(
    builtInToolDescriptionOverlayResolver,
  );
  expect(capturedConversationRuntime?.builtInToolDescriptionOverlayResolver({
    providerName: "openai",
    selectedModelId: "custom-built-in-tool-model",
    assistantTurnKind: "primary_assistant_agent",
    assistantAgentName: "status",
    availableToolNames: ["read"],
  })).toEqual([
    {
      toolName: "read",
      additionalDescriptionParagraphs: ["test-built-in-tool-description:openai:custom-built-in-tool-model"],
    },
  ]);
  expect(capturedPrimaryAgentDisplayMetadata).toContainEqual({
    agentName: "status",
    displayName: "Status Agent",
    shortLabel: "Status",
    description: "Uses a code-registered status tool.",
    accentColorName: "cyan",
  });
  const conversationTurnProvider = capturedConversationRuntime?.conversationTurnProvider;
  if (!(conversationTurnProvider instanceof OpenAiProvider)) {
    throw new Error("expected direct OpenAI provider");
  }
  expect(conversationTurnProvider.modelBehaviorProfileResolver({ selectedModelId: "custom-openai-model" })).toEqual({
    profileId: "test-openai-profile:custom-openai-model",
    requestReasoningSummary: false,
    requestLowTextVerbosity: true,
    allowParallelToolCalls: false,
    defaultReasoningEncryptedContentInclusionPolicy: "when_input_contains_reasoning",
  });
});

test("runInteractiveChat applies a single assistant runtime configuration object", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-runtime-config-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const conversationSessionStoreStub = createConversationSessionStoreStub({ directoryPath: dir });
  const customToolName = "runtime_config_status";
  const customAssistantToolDefinition = {
    toolName: customToolName,
    providerToolDefinition: {
      toolName: customToolName,
      description: "Summarize runtime configuration status.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
    executionPolicy: {
      workspaceEffectKind: "read_only",
      isAutoConcurrent: false,
      isAutoApprovedReadOnly: false,
      clearsSameTurnReadCoverageBeforeExecution: false,
    },
    executor: async () => ({
      outcomeKind: "completed",
      toolResultText: "Runtime configuration status is available.",
    }),
  } satisfies CustomAssistantToolDefinition;
  const customPrimaryAgentDefinition = {
    agentName: "runtime_config_status",
    displayName: "Runtime Config Status Agent",
    shortLabel: "Runtime Config",
    description: "Uses a single assistant runtime configuration object.",
    accentColorName: "cyan",
    isReadOnly: true,
    availableToolNames: [customToolName],
    systemPromptConfiguration: {
      promptConfigurationKind: "custom",
      systemReminderText: "Use the runtime configuration status tool when status is requested.",
    },
  } satisfies PrimaryAssistantAgentDefinition;
  const assistantRuntimeConfiguration = createAssistantRuntimeConfiguration({
    additionalPrimaryAgents: [customPrimaryAgentDefinition],
    additionalCustomTools: [customAssistantToolDefinition],
  });
  let capturedConversationRuntime: AssistantConversationRuntime | undefined;
  let capturedPrimaryAgentDisplayMetadata:
    | ReturnType<AssistantConversationRuntime["listPrimaryAgentDisplayMetadata"]>
    | undefined;

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  const output = await runInteractiveChat({
    store,
    conversationSessionStore: conversationSessionStoreStub.conversationSessionStore,
    stdin: { isTTY: true },
    environment: {},
    assistantRuntimeConfiguration,
    renderChatScreen: async (renderInput) => {
      capturedConversationRuntime = renderInput.assistantConversationRunner as AssistantConversationRuntime;
      capturedPrimaryAgentDisplayMetadata = renderInput.primaryAgentDisplayMetadata;
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  });

  expect(output).toBe("");
  expect(capturedConversationRuntime?.assistantAgentRegistry).toBe(
    assistantRuntimeConfiguration.assistantAgentRegistry,
  );
  expect(capturedConversationRuntime?.assistantToolRegistry).toBe(assistantRuntimeConfiguration.assistantToolRegistry);
  expect(capturedConversationRuntime?.assistantToolRegistry.resolveCustomToolDefinition(customToolName)).toBe(
    customAssistantToolDefinition,
  );
  expect(capturedPrimaryAgentDisplayMetadata).toContainEqual({
    agentName: "runtime_config_status",
    displayName: "Runtime Config Status Agent",
    shortLabel: "Runtime Config",
    description: "Uses a single assistant runtime configuration object.",
    accentColorName: "cyan",
  });
});

test("runInteractiveChat composes generic MCP tools into the default assistant runtime when env is configured", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-novibe-mcp-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const conversationSessionStoreStub = createConversationSessionStoreStub({ directoryPath: dir });
  let capturedMcpRuntimeIntegrationInput: CreateMcpRuntimeIntegrationInput | undefined;
  let capturedConversationRuntime: AssistantConversationRuntime | undefined;
  let capturedStartupIntegrationNotices: RenderChatScreenInTerminalInput["startupIntegrationNotices"];
  let disposeCount = 0;

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  const output = await runInteractiveChat({
    store,
    conversationSessionStore: conversationSessionStoreStub.conversationSessionStore,
    stdin: { isTTY: true },
    environment: {
      BULI_NOVIBE_MCP_BEARER_TOKEN: " raw-dev-token ",
      BULI_NOVIBE_MCP_URL: "http://localhost:8001/v1/mcp",
      BULI_NOVIBE_MCP_TIMEOUT_MS: "12345",
    },
    createMcpRuntimeIntegration: async (integrationInput) => {
      capturedMcpRuntimeIntegrationInput = integrationInput;
      const integration = createMcpAssistantRuntimeConfiguration({
        connectedServers: [{
          serverConfiguration: integrationInput.serverConfigurations[0] ?? {
            serverName: "novibe",
            displayName: "NoVibe",
            transport: "streamable_http",
            url: "http://localhost:8001/v1/mcp",
            timeoutMs: 12_345,
          },
          listedMcpTools: [
            {
              name: "teacher_library_note_read",
              description: "Read a NoVibe library note.",
              inputSchema: {
                properties: {
                  note_id: { type: "string", format: "uuid" },
                },
                required: ["note_id"],
              },
            },
          ],
          callMcpTool: async () => ({ content: [{ type: "text", text: "note" }] }),
          dispose: () => {},
        }],
      });
      return {
        ...integration,
        serverStatuses: [{
          statusKind: "connected",
          serverName: "novibe",
          displayName: "NoVibe",
          url: "http://localhost:8001/v1/mcp",
          toolCount: 1,
          toolNames: ["novibe_teacher_library_note_read"],
        }],
        dispose: async () => {
          disposeCount += 1;
          await integration.dispose();
        },
      };
    },
    renderChatScreen: async (renderInput) => {
      capturedConversationRuntime = renderInput.assistantConversationRunner as AssistantConversationRuntime;
      capturedStartupIntegrationNotices = renderInput.startupIntegrationNotices;
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  });

  expect(output).toBe("");
  expect(capturedMcpRuntimeIntegrationInput?.serverConfigurations).toEqual([{
    serverName: "novibe",
    displayName: "NoVibe",
    transport: "streamable_http",
    url: "http://localhost:8001/v1/mcp",
    bearerToken: "raw-dev-token",
    timeoutMs: 12_345,
  }]);
  expect(disposeCount).toBe(1);
  expect(capturedStartupIntegrationNotices).toEqual([
    { noticeSeverity: "success", noticeText: "MCP: novibe connected (1 tools)" },
  ]);
  expect(
    capturedConversationRuntime?.assistantToolRegistry.resolveCustomToolDefinition("novibe_teacher_library_note_read")
      .toolName,
  ).toBe("novibe_teacher_library_note_read");
  const primaryAssistantAgentCompositionResolver = capturedConversationRuntime?.primaryAssistantAgentCompositionResolver;
  if (!capturedConversationRuntime || !primaryAssistantAgentCompositionResolver) {
    throw new Error("expected captured runtime with NoVibe MCP overlay resolver");
  }
  expect(primaryAssistantAgentCompositionResolver({
    registeredPrimaryAssistantAgent: capturedConversationRuntime.assistantAgentRegistry.resolvePrimaryAgentDefinition("understand"),
    providerName: "openai",
    selectedModelId: "test-model",
  }).primaryAssistantAgent.availableToolNames).toEqual(expect.arrayContaining([
    "read",
    "task",
    "novibe_teacher_library_note_read",
  ]));
});

test("runInteractiveChat keeps starting when a configured MCP server is unavailable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-novibe-mcp-unavailable-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const conversationSessionStoreStub = createConversationSessionStoreStub({ directoryPath: dir });
  let createMcpRuntimeIntegrationCallCount = 0;
  let capturedConversationRuntime: AssistantConversationRuntime | undefined;
  let capturedStartupIntegrationNotices: RenderChatScreenInTerminalInput["startupIntegrationNotices"];

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  const output = await runInteractiveChat({
    store,
    conversationSessionStore: conversationSessionStoreStub.conversationSessionStore,
    stdin: { isTTY: true },
    environment: { BULI_NOVIBE_MCP_BEARER_TOKEN: "raw-dev-token" },
    createMcpRuntimeIntegration: async () => {
      createMcpRuntimeIntegrationCallCount += 1;
      return {
        assistantRuntimeConfiguration: createAssistantRuntimeConfiguration(),
        toolNames: [],
        serverStatuses: [{
          statusKind: "unavailable",
          serverName: "novibe",
          displayName: "NoVibe",
          url: "http://localhost:8001/v1/mcp",
          errorMessage: "NoVibe MCP server is offline",
        }],
        dispose: async () => {},
      };
    },
    renderChatScreen: async (renderInput) => {
      capturedConversationRuntime = renderInput.assistantConversationRunner as AssistantConversationRuntime;
      capturedStartupIntegrationNotices = renderInput.startupIntegrationNotices;
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  });

  expect(output).toBe("");
  expect(createMcpRuntimeIntegrationCallCount).toBe(1);
  expect(capturedStartupIntegrationNotices).toEqual([
    { noticeSeverity: "warning", noticeText: "MCP: novibe unavailable: NoVibe MCP server is offline" },
  ]);
  expect(capturedConversationRuntime).toBeDefined();
  expect(() => {
    capturedConversationRuntime?.assistantToolRegistry.resolveCustomToolDefinition("novibe_teacher_library_note_read");
  }).toThrow("Custom assistant tool is not registered: novibe_teacher_library_note_read");
});

test("runInteractiveChat rejects mixed assistant runtime configuration inputs", async () => {
  const assistantRuntimeConfiguration = createAssistantRuntimeConfiguration();

  await expect(runInteractiveChat({
    assistantRuntimeConfiguration,
    assistantAgentRegistry: assistantRuntimeConfiguration.assistantAgentRegistry,
  })).rejects.toThrow("Use one composition path; remove: assistantAgentRegistry.");
});

test("runInteractiveChat uses the prompt-context root environment override", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-prompt-context-"));
  const promptContextBrowseRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-root-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath: join(dir, "session-store.sqlite"),
    createSessionId: () => "session-a",
    createSessionEntryId: () => "entry-a",
    nowMs: () => 1_000,
  });
  let capturedConversationRuntime: AssistantConversationRuntime | undefined;

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  try {
    const output = await runInteractiveChat({
      store,
      conversationSessionStore,
      stdin: { isTTY: true },
      environment: { BULI_PROMPT_CONTEXT_ROOT: promptContextBrowseRootPath },
      renderChatScreen: async (renderInput) => {
        capturedConversationRuntime = renderInput.assistantConversationRunner as AssistantConversationRuntime;
        return { destroy: () => {}, waitUntilExit: async () => {} };
      },
    });

    expect(output).toBe("");
    expect(capturedConversationRuntime?.workspaceRootPath).toBe(process.cwd());
    expect(capturedConversationRuntime?.promptContextBrowseRootPath).toBe(resolve(promptContextBrowseRootPath));
    expect(capturedConversationRuntime?.promptContextStartingDirectoryPath).toBe(resolve(promptContextBrowseRootPath));
  } finally {
    conversationSessionStore.close();
  }
});

test("runInteractiveChat passes the known default model reasoning effort to the renderer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const conversationSessionStoreStub = createConversationSessionStoreStub({ directoryPath: dir });
  let receivedSelection: {
    selectedModelId: string;
    selectedModelDefaultReasoningEffort: ReasoningEffort | undefined;
    selectedReasoningEffort: ReasoningEffort | undefined;
  } | undefined;

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  const output = await runInteractiveChat({
    store,
    conversationSessionStore: conversationSessionStoreStub.conversationSessionStore,
    stdin: { isTTY: true },
    environment: {},
    renderChatScreen: async (renderInput) => {
      receivedSelection = {
        selectedModelId: renderInput.selectedModelId,
        selectedModelDefaultReasoningEffort: renderInput.selectedModelDefaultReasoningEffort,
        selectedReasoningEffort: renderInput.selectedReasoningEffort,
      };
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  });

  expect(output).toBe("");
  expect(receivedSelection).toEqual({
    selectedModelId: "gpt-5.5",
    selectedModelDefaultReasoningEffort: "medium",
    selectedReasoningEffort: "medium",
  });
});

test("runInteractiveChat uses persisted session model selection before app defaults", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-persisted-model-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const persistedModelSelection: ConversationSessionModelSelection = {
    selectedModelId: "gpt-5.4",
    selectedModelDefaultReasoningEffort: "low",
    selectedReasoningEffort: "high",
  };
  const conversationSessionStoreStub = createConversationSessionStoreStub({
    directoryPath: dir,
    activeModelSelection: persistedModelSelection,
  });
  let receivedSelection: {
    selectedModelId: string;
    selectedModelDefaultReasoningEffort: ReasoningEffort | undefined;
    selectedReasoningEffort: ReasoningEffort | undefined;
  } | undefined;

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  const output = await runInteractiveChat({
    store,
    conversationSessionStore: conversationSessionStoreStub.conversationSessionStore,
    stdin: { isTTY: true },
    environment: {},
    renderChatScreen: async (renderInput) => {
      receivedSelection = {
        selectedModelId: renderInput.selectedModelId,
        selectedModelDefaultReasoningEffort: renderInput.selectedModelDefaultReasoningEffort,
        selectedReasoningEffort: renderInput.selectedReasoningEffort,
      };
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  });

  expect(output).toBe("");
  expect(receivedSelection).toEqual({
    selectedModelId: persistedModelSelection.selectedModelId,
    selectedModelDefaultReasoningEffort: persistedModelSelection.selectedModelDefaultReasoningEffort,
    selectedReasoningEffort: persistedModelSelection.selectedReasoningEffort,
  });
});

test("runInteractiveChat skips saving unchanged startup model selection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-unchanged-model-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const persistedModelSelection: ConversationSessionModelSelection = {
    selectedModelId: "gpt-5.5",
    selectedModelDefaultReasoningEffort: "medium",
    selectedReasoningEffort: "medium",
  };
  const conversationSessionStoreStub = createConversationSessionStoreStub({
    directoryPath: dir,
    activeModelSelection: persistedModelSelection,
  });

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  const output = await runInteractiveChat({
    store,
    conversationSessionStore: conversationSessionStoreStub.conversationSessionStore,
    stdin: { isTTY: true },
    environment: {},
    renderChatScreen: async () => ({ destroy: () => {}, waitUntilExit: async () => {} }),
  });

  expect(output).toBe("");
  expect(conversationSessionStoreStub.savedModelSelections).toEqual([]);
});

test("runInteractiveChat lets startup model flags override persisted session settings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-model-override-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const conversationSessionStoreStub = createConversationSessionStoreStub({
    directoryPath: dir,
    activeModelSelection: {
      selectedModelId: "gpt-5.4",
      selectedModelDefaultReasoningEffort: "low",
      selectedReasoningEffort: "high",
    },
  });
  let receivedSelection: {
    selectedModelId: string;
    selectedModelDefaultReasoningEffort: ReasoningEffort | undefined;
    selectedReasoningEffort: ReasoningEffort | undefined;
  } | undefined;

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  const output = await runInteractiveChat({
    selectedModelId: "gpt-5.5",
    selectedReasoningEffort: "medium",
    store,
    conversationSessionStore: conversationSessionStoreStub.conversationSessionStore,
    stdin: { isTTY: true },
    environment: {},
    renderChatScreen: async (renderInput) => {
      receivedSelection = {
        selectedModelId: renderInput.selectedModelId,
        selectedModelDefaultReasoningEffort: renderInput.selectedModelDefaultReasoningEffort,
        selectedReasoningEffort: renderInput.selectedReasoningEffort,
      };
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  });

  expect(output).toBe("");
  expect(receivedSelection).toEqual({
    selectedModelId: "gpt-5.5",
    selectedModelDefaultReasoningEffort: "medium",
    selectedReasoningEffort: "medium",
  });
  expect(conversationSessionStoreStub.savedModelSelections.at(-1)).toEqual({
    selectedModelId: "gpt-5.5",
    selectedModelDefaultReasoningEffort: "medium",
    selectedReasoningEffort: "medium",
  });
});

test("runInteractiveChat restores console logging after the renderer exits", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-console-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const conversationSessionStoreStub = createConversationSessionStoreStub({ directoryPath: dir });
  const originalConsoleLog = console.log;
  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  const output = await runInteractiveChat({
    store,
    conversationSessionStore: conversationSessionStoreStub.conversationSessionStore,
    stdin: { isTTY: true },
    environment: {
      BULI_CONSOLE_LOG_FILE: join(dir, "console.log"),
      BULI_CONSOLE_LOG_RESET: "true",
    },
    renderChatScreen: async () => {
      expect(console.log).not.toBe(originalConsoleLog);
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  });

  expect(output).toBe("");
  expect(console.log).toBe(originalConsoleLog);
});

test("runInteractiveChat writes startup timing diagnostics", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-startup-timing-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const conversationSessionStoreStub = createConversationSessionStoreStub({ directoryPath: dir });
  const logFilePath = join(dir, "startup.log");

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  const output = await runInteractiveChat({
    store,
    conversationSessionStore: conversationSessionStoreStub.conversationSessionStore,
    stdin: { isTTY: true },
    environment: {
      BULI_CONSOLE_LOG_FILE: logFilePath,
      BULI_CONSOLE_LOG_RESET: "true",
      BULI_TASK_SUBAGENT_MODEL: "gpt-5.4-mini",
      BULI_TASK_SUBAGENT_MAX_REASONING_EFFORT: "low",
    },
    renderChatScreen: async () => ({ destroy: () => {}, waitUntilExit: async () => {} }),
  });

  expect(output).toBe("");
  const diagnosticLogText = await readFile(logFilePath, "utf8");
  expect(diagnosticLogText).toContain("interactive_chat.startup_timing");
  expect(diagnosticLogText).toContain("taskSubagentSelectedModelIdOverride: 'gpt-5.4-mini'");
  expect(diagnosticLogText).toContain("taskSubagentMaximumReasoningEffortOverride: 'low'");
  expect(diagnosticLogText).toContain("phase: 'auth'");
  expect(diagnosticLogText).toContain("phase: 'session_load'");
  expect(diagnosticLogText).toContain("phase: 'renderer_load'");
  expect(diagnosticLogText).toContain("phase: 'render'");
});

test("runInteractiveChat restores console logging when the renderer throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-console-error-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const conversationSessionStoreStub = createConversationSessionStoreStub({ directoryPath: dir });
  const originalConsoleLog = console.log;
  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  await expect(runInteractiveChat({
    store,
    conversationSessionStore: conversationSessionStoreStub.conversationSessionStore,
    stdin: { isTTY: true },
    environment: {
      BULI_CONSOLE_LOG_FILE: join(dir, "console.log"),
      BULI_CONSOLE_LOG_RESET: "true",
    },
    renderChatScreen: async () => {
      expect(console.log).not.toBe(originalConsoleLog);
      throw new Error("renderer failed");
    },
  })).rejects.toThrow("renderer failed");

  expect(console.log).toBe(originalConsoleLog);
});

test("runInteractiveChat keeps full runtime history while giving the renderer only paged transcript loading", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const initialConversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Previous prompt",
      modelFacingPromptText: "Previous prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Previous answer",
    },
  ];
  const savedConversationSessionEntries: ConversationSessionEntry[][] = [];
  const savedModelSelections: ConversationSessionModelSelection[] = [];
  let fullConversationSessionEntryLoadCount = 0;
  let activeModelSelection: ConversationSessionModelSelection | undefined;
  let listedConversationSessions: ConversationSessionSummary[] = [
    {
      sessionId: "session-a",
      title: "Previous prompt",
      createdAtMs: 1000,
      updatedAtMs: 2000,
      conversationSessionEntryCount: 2,
    },
    {
      sessionId: "session-b",
      title: "Switched prompt",
      createdAtMs: 3000,
      updatedAtMs: 4000,
      conversationSessionEntryCount: 1,
    },
  ];
  const conversationSessionStore = {
    storagePath: join(dir, "session-store.sqlite"),
    promptCacheKey: "buli:test-workspace",
    loadActiveConversationSessionMetadata: () => ({
      sessionId: "session-a",
      modelSelection: activeModelSelection,
      conversationSessionEntryCount: initialConversationSessionEntries.length,
    }),
    loadActiveConversationSession: () => ({
      sessionId: "session-a",
      modelSelection: activeModelSelection,
      conversationSessionEntries: initialConversationSessionEntries,
    }),
    loadConversationSessionEntries: (conversationSessionId) => {
      fullConversationSessionEntryLoadCount += 1;
      expect(conversationSessionId).toBe("session-a");
      return initialConversationSessionEntries;
    },
    loadConversationSessionEntryRecords: (request) => ({
      conversationSessionId: request.conversationSessionId ?? "session-a",
      entryRecords: initialConversationSessionEntries.map((conversationSessionEntry, entrySequence) => ({
        entrySequence,
        conversationSessionEntry,
      })),
      hasOlderEntries: false,
      hasNewerEntries: false,
      latestCompactionSummaryEntrySequence: undefined,
    }),
    appendConversationSessionEntry: (conversationSessionEntry) => {
      savedConversationSessionEntries.push([...initialConversationSessionEntries, conversationSessionEntry]);
    },
    saveConversationSessionEntries: (conversationSessionEntries) => {
      savedConversationSessionEntries.push([...conversationSessionEntries]);
    },
    saveActiveConversationSessionModelSelection: (modelSelection) => {
      activeModelSelection = modelSelection;
      savedModelSelections.push(modelSelection);
    },
    startNewConversationSession: (startNewConversationSessionInput) => {
      activeModelSelection = startNewConversationSessionInput?.modelSelection;
      return {
        sessionId: "session-new",
        modelSelection: activeModelSelection,
        conversationSessionEntries: [],
      };
    },
    listConversationSessions: () => listedConversationSessions,
    switchActiveConversationSession: (sessionId) => ({
      sessionId,
      modelSelection: undefined,
      conversationSessionEntries: [
        {
          entryKind: "user_prompt",
          promptText: "Switched prompt",
          modelFacingPromptText: "Switched prompt",
        },
      ],
    }),
    switchActiveConversationSessionMetadata: (sessionId) => ({
      sessionId,
      modelSelection: undefined,
      conversationSessionEntryCount: 1,
    }),
    deleteConversationSession: (sessionId) => {
      listedConversationSessions = listedConversationSessions.filter(
        (conversationSession) => conversationSession.sessionId !== sessionId,
      );
      return {
        sessionId: "session-a",
        modelSelection: undefined,
        conversationSessionEntries: initialConversationSessionEntries,
      };
    },
    deleteConversationSessionAndLoadActiveMetadata: (sessionId) => {
      listedConversationSessions = listedConversationSessions.filter(
        (conversationSession) => conversationSession.sessionId !== sessionId,
      );
      return {
        sessionId: "session-a",
        modelSelection: undefined,
        conversationSessionEntryCount: initialConversationSessionEntries.length,
      };
    },
  } satisfies ConversationSessionStore;
  let capturedConversationRuntime: AssistantConversationRuntime | undefined;
  let capturedClearConversation: (() => void) | undefined;
  let capturedSwitchConversationSession:
    | ((conversationSessionId: string) => Promise<ConversationSessionSwitchResult> | ConversationSessionSwitchResult)
    | undefined;
  let capturedDeleteConversationSession:
    | ((conversationSessionId: string) => Promise<ConversationSessionDeleteResult> | ConversationSessionDeleteResult)
    | undefined;
  let capturedExportCurrentConversationSession:
    | (() => Promise<{ exportFilePath: string; exportFileUrl: string }> | { exportFilePath: string; exportFileUrl: string })
    | undefined;
  let capturedCompactCurrentConversationSession:
    | ((input: ConversationCompactionRequest) => Promise<{ conversationSessionEntries: readonly ConversationSessionEntry[] }> | {
      conversationSessionEntries: readonly ConversationSessionEntry[];
    })
    | undefined;
  let capturedAutoCompactCurrentConversationSession:
    | ((input: ConversationAutoCompactionRequest) => Promise<ConversationAutoCompactionResult> | ConversationAutoCompactionResult)
    | undefined;
  let capturedLoadConversationTranscriptEntryRecords:
    | NonNullable<RenderChatScreenInTerminalInput["loadConversationTranscriptEntryRecords"]>
    | undefined;
  const openedBrowserUrls: string[] = [];
  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  const output = await runInteractiveChat({
    store,
    conversationSessionStore,
    conversationSessionExportDirectoryPath: dir,
    openBrowserUrl: async (url) => {
      openedBrowserUrls.push(url);
    },
    stdin: { isTTY: true },
    environment: {},
    renderChatScreen: async (renderInput) => {
      capturedConversationRuntime = renderInput.assistantConversationRunner as AssistantConversationRuntime;
      capturedClearConversation = renderInput.onConversationCleared;
      capturedSwitchConversationSession = renderInput.switchConversationSession;
      capturedDeleteConversationSession = renderInput.deleteConversationSession;
      capturedExportCurrentConversationSession = renderInput.exportCurrentConversationSession;
      capturedCompactCurrentConversationSession = renderInput.compactCurrentConversationSession;
      capturedAutoCompactCurrentConversationSession = renderInput.autoCompactCurrentConversationSession;
      capturedLoadConversationTranscriptEntryRecords = renderInput.loadConversationTranscriptEntryRecords;
      expect(renderInput.initialConversationSessionEntries).toBeUndefined();
      expect(renderInput.loadInitialConversationSessionEntries).toBeUndefined();
      expect(renderInput.loadConversationTranscriptEntryRecords).toBeDefined();
      expect(renderInput.onConversationTranscriptPageEntryRecordsLoaded).toBeUndefined();
      expect(renderInput.initialConversationSessionId).toBe("session-a");
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  });

  expect(output).toBe("");
  expect(fullConversationSessionEntryLoadCount).toBe(1);
  expect(capturedConversationRuntime?.conversationHistory.listConversationSessionEntries()).toEqual(initialConversationSessionEntries);
  if (!capturedLoadConversationTranscriptEntryRecords) {
    throw new Error("expected paged transcript loader");
  }
  expect(capturedConversationRuntime?.promptContextBrowseRootPath).toBe(dirname(process.cwd()));
  expect(capturedConversationRuntime?.promptContextStartingDirectoryPath).toBe(process.cwd());
  expect(capturedCompactCurrentConversationSession).toBeDefined();
  expect(capturedAutoCompactCurrentConversationSession).toBeDefined();
  expect(capturedDeleteConversationSession).toBeDefined();

  capturedConversationRuntime?.conversationHistory.appendConversationSessionEntry({
    entryKind: "user_prompt",
    promptText: "Next prompt",
    modelFacingPromptText: "Next prompt",
  });

  expect(savedConversationSessionEntries).toEqual<ConversationSessionEntry[][]>([
    [
      ...initialConversationSessionEntries,
      {
        entryKind: "user_prompt",
        promptText: "Next prompt",
        modelFacingPromptText: "Next prompt",
      },
    ],
  ]);

  if (!capturedConversationRuntime || !capturedAutoCompactCurrentConversationSession) {
    throw new Error("expected captured runtime and auto-compaction callback");
  }
  const conversationRuntime = capturedConversationRuntime;
  const autoCompactCurrentConversationSession = capturedAutoCompactCurrentConversationSession;

  const skippedAutoCompactionResult = await Promise.resolve(
    autoCompactCurrentConversationSession({
      selectedModelId: "gpt-5.5",
      latestContextWindowUsage: { total: 10, input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    }),
  );
  expect(skippedAutoCompactionResult).toMatchObject({
    didCompact: false,
    decision: {
      shouldCompact: false,
      reason: "context_usage_below_threshold",
    },
  });

  conversationRuntime.autoCompactConversationSession = async (autoCompactionRequest) => {
    expect(autoCompactionRequest).toEqual({
      selectedModelId: "gpt-5.5",
      latestContextWindowUsage: { total: 390_000, input: 390_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    const compactedEntryCount = conversationRuntime.conversationHistory.listConversationSessionEntries().length;
    conversationRuntime.conversationHistory.appendConversationSessionEntry({
      entryKind: "conversation_compaction_summary",
      summaryText: "Goal: continue after automatic compaction.",
      compactedEntryCount,
      retainedRecentConversationSessionEntryCount: 0,
    });
    const conversationSessionEntries = conversationRuntime.conversationHistory.listConversationSessionEntries();
    return {
      didCompact: true,
      decision: {
        shouldCompact: true,
        reason: "context_usage_threshold_reached",
        selectedModelId: "gpt-5.5",
        contextTokensUsed: 390_000,
        contextUsageRatio: 390_000 / 1_050_000,
        contextWindowTokenCapacity: 1_050_000,
        contextCompactionTriggerTokenCount: 252_000,
        reservedTokenCount: undefined,
        thresholdRatio: 0.8,
        triggerKind: "threshold_ratio",
        sessionEntryCountAfterLatestCompactionSummary: 3,
      },
      conversationSessionEntries,
    };
  };
  const completedAutoCompactionResult = await Promise.resolve(
    autoCompactCurrentConversationSession({
      selectedModelId: "gpt-5.5",
      latestContextWindowUsage: { total: 390_000, input: 390_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    }),
  );
  if (!completedAutoCompactionResult.didCompact) {
    throw new Error("expected auto-compaction to run");
  }

  expect(completedAutoCompactionResult.decision.reason).toBe("context_usage_threshold_reached");
  expect(completedAutoCompactionResult.conversationSessionEntries).toContainEqual({
    entryKind: "conversation_compaction_summary",
    summaryText: "Goal: continue after automatic compaction.",
    compactedEntryCount: 3,
    retainedRecentConversationSessionEntryCount: 0,
  });

  const exportResult = await Promise.resolve(capturedExportCurrentConversationSession?.());
  if (!exportResult) {
    throw new Error("expected export callback");
  }

  expect(openedBrowserUrls).toEqual([exportResult.exportFileUrl]);
  await expect(readFile(exportResult.exportFilePath, "utf8")).resolves.toContain("Previous prompt");
  await expect(readFile(exportResult.exportFilePath, "utf8")).resolves.toContain("Previous answer");
  await expect(readFile(exportResult.exportFilePath, "utf8")).resolves.toContain("Next prompt");

  capturedClearConversation?.();
  expect(capturedConversationRuntime?.conversationHistory.listConversationSessionEntries()).toEqual([]);

  await expect(Promise.resolve(capturedSwitchConversationSession?.("session-b"))).resolves.toEqual({
    conversationSessionId: "session-b",
  });
  expect(fullConversationSessionEntryLoadCount).toBe(1);
  expect(capturedConversationRuntime?.conversationHistory.listConversationSessionEntries()).toEqual([
    {
      entryKind: "user_prompt",
      promptText: "Switched prompt",
      modelFacingPromptText: "Switched prompt",
    },
  ]);

  await expect(Promise.resolve(capturedDeleteConversationSession?.("session-b"))).resolves.toEqual({
    deletedConversationSessionId: "session-b",
    activeConversationSessionId: "session-a",
    conversationSessions: [
      {
        sessionId: "session-a",
        title: "Previous prompt",
        createdAtMs: 1000,
        updatedAtMs: 2000,
        conversationSessionEntryCount: 2,
      },
    ],
  });
  expect(fullConversationSessionEntryLoadCount).toBe(1);
  expect(capturedConversationRuntime?.conversationHistory.listConversationSessionEntries()).toEqual(initialConversationSessionEntries);
});

test("SqliteConversationSessionStore uses a workspace-scoped default path and prompt cache key", async () => {
  const workspaceRootPath = join(tmpdir(), "buli-workspace-a");
  const otherWorkspaceRootPath = join(tmpdir(), "buli-workspace-b");
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-default-path-"));

  const sessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "a.sqlite"),
    workspaceRootPath,
  });
  const otherSessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "b.sqlite"),
    workspaceRootPath: otherWorkspaceRootPath,
  });

  try {
    expect(defaultConversationSessionDatabasePath({ workspaceRootPath })).toContain("conversation-sessions");
    expect(defaultConversationSessionDatabasePath({ workspaceRootPath })).not.toBe(
      defaultConversationSessionDatabasePath({ workspaceRootPath: otherWorkspaceRootPath }),
    );
    expect(sessionStore.promptCacheKey.startsWith("buli:")).toBe(true);
    expect(sessionStore.promptCacheKey).not.toBe(otherSessionStore.promptCacheKey);
  } finally {
    sessionStore.close();
    otherSessionStore.close();
  }
});

test("runListAvailableModels returns a clean message when auth is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-models-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await expect(runListAvailableModels({ store })).resolves.toBe("OpenAI auth not found. Run `buli login`.");
});

test("main prints usage for an unknown command", async () => {
  const outputs: string[] = [];
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  let observedExitCode: string | number | undefined;
  process.exitCode = undefined;

  console.log = (value?: unknown) => {
    outputs.push(String(value ?? ""));
  };

  try {
    await main(["unknown"]);
    observedExitCode = process.exitCode;
  } finally {
    console.log = originalLog;
    process.exitCode = originalExitCode ?? 0;
  }

  expect(outputs).toEqual([CLI_USAGE]);
  expect(Number(observedExitCode)).toBe(1);
});

function createFakeMcpRuntimeIntegration(input: {
  toolNames: readonly string[];
  serverStatuses: McpRuntimeIntegration["serverStatuses"];
  dispose?: (() => Promise<void> | void) | undefined;
}): McpRuntimeIntegration {
  return {
    assistantRuntimeConfiguration: createAssistantRuntimeConfiguration(),
    toolNames: input.toolNames,
    serverStatuses: input.serverStatuses,
    dispose: async () => {
      await input.dispose?.();
    },
  };
}

function createConversationSessionStoreStub(input: {
  directoryPath: string;
  activeModelSelection?: ConversationSessionModelSelection | undefined;
  initialConversationSessionEntries?: readonly ConversationSessionEntry[] | undefined;
}): {
  conversationSessionStore: ConversationSessionStore;
  savedModelSelections: ConversationSessionModelSelection[];
} {
  const initialConversationSessionEntries = input.initialConversationSessionEntries ?? [];
  const savedModelSelections: ConversationSessionModelSelection[] = [];
  let activeModelSelection = input.activeModelSelection;
  const conversationSessionStore = {
    storagePath: join(input.directoryPath, "session-store.sqlite"),
    promptCacheKey: "buli:test-workspace",
    loadActiveConversationSessionMetadata: () => ({
      sessionId: "session-a",
      modelSelection: activeModelSelection,
      conversationSessionEntryCount: initialConversationSessionEntries.length,
    }),
    loadActiveConversationSession: () => ({
      sessionId: "session-a",
      modelSelection: activeModelSelection,
      conversationSessionEntries: initialConversationSessionEntries,
    }),
    loadConversationSessionEntries: () => initialConversationSessionEntries,
    loadConversationSessionEntryRecords: (request) => ({
      conversationSessionId: request.conversationSessionId ?? "session-a",
      entryRecords: initialConversationSessionEntries.map((conversationSessionEntry, entrySequence) => ({
        entrySequence,
        conversationSessionEntry,
      })),
      hasOlderEntries: false,
      hasNewerEntries: false,
      latestCompactionSummaryEntrySequence: undefined,
    }),
    appendConversationSessionEntry: () => {},
    saveActiveConversationSessionModelSelection: (modelSelection) => {
      activeModelSelection = modelSelection;
      savedModelSelections.push(modelSelection);
    },
    saveConversationSessionEntries: () => {},
    startNewConversationSession: (startNewConversationSessionInput) => {
      activeModelSelection = startNewConversationSessionInput?.modelSelection;
      return {
        sessionId: "session-new",
        modelSelection: activeModelSelection,
        conversationSessionEntries: [],
      };
    },
    listConversationSessions: () => [],
    switchActiveConversationSession: (sessionId) => ({
      sessionId,
      modelSelection: activeModelSelection,
      conversationSessionEntries: initialConversationSessionEntries,
    }),
    switchActiveConversationSessionMetadata: (sessionId) => ({
      sessionId,
      modelSelection: activeModelSelection,
      conversationSessionEntryCount: initialConversationSessionEntries.length,
    }),
    deleteConversationSession: () => ({
      sessionId: "session-a",
      modelSelection: activeModelSelection,
      conversationSessionEntries: initialConversationSessionEntries,
    }),
    deleteConversationSessionAndLoadActiveMetadata: () => ({
      sessionId: "session-a",
      modelSelection: activeModelSelection,
      conversationSessionEntryCount: initialConversationSessionEntries.length,
    }),
  } satisfies ConversationSessionStore;

  return { conversationSessionStore, savedModelSelections };
}
