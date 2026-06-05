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
  type ConversationAutoCompactionRequest,
  type ConversationAutoCompactionResult,
  type ConversationCompactionRequest,
} from "@buli/engine";
import { OpenAiAuthStore, OpenAiProvider } from "@buli/openai";
import { main } from "../src/cli.ts";
import { runInteractiveChat } from "../src/commands/chat.ts";
import { runLogin } from "../src/commands/login.ts";
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
    runLogin: async () => "delegated login",
  });

  expect(output).toEqual({ status: "ok", output: "delegated login" });
});

test("runCli delegates the models command", async () => {
  const output = await runCli(["models"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runLogin: async () => "delegated login",
  });

  expect(output).toEqual({ status: "ok", output: "delegated models" });
});

test("runCli returns usage for unknown commands", async () => {
  const output = await runCli(["unknown"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
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
    runLogin: async () => "delegated login",
  });

  expect(received).toEqual({});
  expect(output).toEqual({ status: "ok", output: "delegated start" });
});

test("runCli returns usage for the removed chat alias", async () => {
  const output = await runCli(["chat"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
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
    runLogin: async () => "delegated login",
  });

  expect(received).toEqual({ bashToolApprovalMode: "trusted" });
  expect(output).toEqual({ status: "ok", output: "delegated start" });
});

test("runCli returns usage when a startup flag is invalid", async () => {
  const output = await runCli(["--reasoning", "wrong"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runLogin: async () => "delegated login",
  });

  expect(output).toEqual({ status: "usage_error", output: CLI_USAGE });
});

test("runCli returns usage successfully for help", async () => {
  const output = await runCli(["--help"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runLogin: async () => "delegated login",
  });

  expect(output).toEqual({ status: "ok", output: CLI_USAGE });
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

test("runInteractiveChat loads persisted session entries and saves when history changes", async () => {
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
      expect(conversationSessionId).toBe("session-a");
      return initialConversationSessionEntries;
    },
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
  } satisfies ConversationSessionStore;
  let capturedConversationRuntime: AssistantConversationRuntime | undefined;
  let capturedClearConversation: (() => void) | undefined;
  let capturedSwitchConversationSession:
    | ((conversationSessionId: string) =>
      | Promise<{
        conversationSessionId: string;
        modelSelection?: ConversationSessionModelSelection | undefined;
        conversationSessionEntries: readonly ConversationSessionEntry[];
      }>
      | {
        conversationSessionId: string;
        modelSelection?: ConversationSessionModelSelection | undefined;
        conversationSessionEntries: readonly ConversationSessionEntry[];
      })
    | undefined;
  let capturedDeleteConversationSession:
    | ((conversationSessionId: string) =>
      | Promise<{
        deletedConversationSessionId: string;
        activeConversationSessionId: string;
        activeConversationSessionModelSelection?: ConversationSessionModelSelection | undefined;
        activeConversationSessionEntries: readonly ConversationSessionEntry[];
        conversationSessions: readonly ConversationSessionSummary[];
      }>
      | {
        deletedConversationSessionId: string;
        activeConversationSessionId: string;
        activeConversationSessionModelSelection?: ConversationSessionModelSelection | undefined;
        activeConversationSessionEntries: readonly ConversationSessionEntry[];
        conversationSessions: readonly ConversationSessionSummary[];
      })
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
  let capturedLoadInitialConversationSessionEntries:
    | ((conversationSessionId: string) => Promise<{
      conversationSessionId: string;
      conversationSessionEntries: readonly ConversationSessionEntry[];
    }> | {
      conversationSessionId: string;
      conversationSessionEntries: readonly ConversationSessionEntry[];
    })
    | undefined;
  let capturedOnInitialConversationSessionEntriesHydrated:
    | ((initialConversationSessionEntriesLoadResult: {
      conversationSessionId: string;
      conversationSessionEntries: readonly ConversationSessionEntry[];
    }) => void | Promise<void>)
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
      capturedLoadInitialConversationSessionEntries = renderInput.loadInitialConversationSessionEntries;
      capturedOnInitialConversationSessionEntriesHydrated = renderInput.onInitialConversationSessionEntriesHydrated;
      expect(renderInput.initialConversationSessionEntries).toBeUndefined();
      expect(renderInput.loadInitialConversationSessionEntries).toBeDefined();
      expect(renderInput.initialConversationSessionId).toBe("session-a");
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  });

  expect(output).toBe("");
  expect(capturedConversationRuntime?.conversationHistory.listConversationSessionEntries()).toEqual([]);
  if (!capturedLoadInitialConversationSessionEntries || !capturedOnInitialConversationSessionEntriesHydrated) {
    throw new Error("expected lazy session hydration callbacks");
  }
  const initialConversationSessionEntriesLoadResult = await Promise.resolve(
    capturedLoadInitialConversationSessionEntries("session-a"),
  );
  await Promise.resolve(capturedOnInitialConversationSessionEntriesHydrated(initialConversationSessionEntriesLoadResult));
  expect(capturedConversationRuntime?.conversationHistory.listConversationSessionEntries()).toEqual(initialConversationSessionEntries);
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
    conversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Switched prompt",
        modelFacingPromptText: "Switched prompt",
      },
    ],
  });
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
    activeConversationSessionEntries: initialConversationSessionEntries,
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
    deleteConversationSession: () => ({
      sessionId: "session-a",
      modelSelection: activeModelSelection,
      conversationSessionEntries: initialConversationSessionEntries,
    }),
  } satisfies ConversationSessionStore;

  return { conversationSessionStore, savedModelSelections };
}
