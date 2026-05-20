import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ConversationSessionEntry, ConversationSessionSummary, ReasoningEffort } from "@buli/contracts";
import {
  AssistantConversationRuntime,
  type ConversationAutoCompactionRequest,
  type ConversationAutoCompactionResult,
  type ConversationCompactionRequest,
} from "@buli/engine";
import { OpenAiAuthStore } from "@buli/openai";
import { main } from "../src/cli.ts";
import { runInteractiveChat } from "../src/commands/chat.ts";
import { runLogin } from "../src/commands/login.ts";
import {
  defaultConversationSessionFilePath,
  FileConversationSessionStore,
  type ConversationSessionStore,
} from "../src/conversationSessionStore.ts";
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

test("runInteractiveChat returns a clean message when auto-compaction threshold environment is invalid", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await expect(runInteractiveChat({ store, environment: { BULI_AUTO_COMPACT_THRESHOLD: "wrong" } })).resolves.toBe(
    "Invalid BULI_AUTO_COMPACT_THRESHOLD. Use a number from 0 through 1.",
  );
});

test("runInteractiveChat uses the prompt-context root environment override", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-prompt-context-"));
  const promptContextBrowseRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-root-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
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
    conversationSessionStore: new FileConversationSessionStore({
      filePath: join(dir, "conversation-session.json"),
      sessionWorkspaceDirectoryPath: join(dir, "conversation-sessions"),
      createSessionId: () => "session-a",
      createSessionEntryId: () => "entry-a",
      nowMs: () => 1_000,
    }),
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
});

test("runInteractiveChat passes the known default model reasoning effort to the renderer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
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

test("runInteractiveChat restores console logging after the renderer exits", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-console-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
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

test("runInteractiveChat restores console logging when the renderer throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-console-error-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
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
    filePath: join(dir, "conversation-session.json"),
    promptCacheKey: "buli:test-workspace",
    loadActiveConversationSession: () => ({
      sessionId: "session-a",
      filePath: join(dir, "session-a.jsonl"),
      conversationSessionEntries: initialConversationSessionEntries,
    }),
    loadConversationSessionEntries: () => initialConversationSessionEntries,
    appendConversationSessionEntry: (conversationSessionEntry) => {
      savedConversationSessionEntries.push([...initialConversationSessionEntries, conversationSessionEntry]);
    },
    saveConversationSessionEntries: (conversationSessionEntries) => {
      savedConversationSessionEntries.push([...conversationSessionEntries]);
    },
    startNewConversationSession: () => ({
      sessionId: "session-new",
      filePath: join(dir, "session-new.jsonl"),
      conversationSessionEntries: [],
    }),
    listConversationSessions: () => listedConversationSessions,
    switchActiveConversationSession: (sessionId) => ({
      sessionId,
      filePath: join(dir, `${sessionId}.jsonl`),
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
        filePath: join(dir, "session-a.jsonl"),
        conversationSessionEntries: initialConversationSessionEntries,
      };
    },
  } satisfies ConversationSessionStore;
  let capturedConversationRuntime: AssistantConversationRuntime | undefined;
  let capturedClearConversation: (() => void) | undefined;
  let capturedSwitchConversationSession:
    | ((conversationSessionId: string) =>
      | Promise<{ conversationSessionId: string; conversationSessionEntries: readonly ConversationSessionEntry[] }>
      | { conversationSessionId: string; conversationSessionEntries: readonly ConversationSessionEntry[] })
    | undefined;
  let capturedDeleteConversationSession:
    | ((conversationSessionId: string) =>
      | Promise<{
        deletedConversationSessionId: string;
        activeConversationSessionId: string;
        activeConversationSessionEntries: readonly ConversationSessionEntry[];
        conversationSessions: readonly ConversationSessionSummary[];
      }>
      | {
        deletedConversationSessionId: string;
        activeConversationSessionId: string;
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
      expect(renderInput.initialConversationSessionEntries).toEqual(initialConversationSessionEntries);
      expect(renderInput.initialConversationSessionId).toBe("session-a");
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  });

  expect(output).toBe("");
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
      latestTokenUsage: { total: 10, input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    }),
  );
  expect(skippedAutoCompactionResult).toMatchObject({
    didCompact: false,
    decision: {
      shouldCompact: false,
      reason: "context_usage_below_reserved_token_limit",
    },
  });

  conversationRuntime.autoCompactConversationSession = async (autoCompactionRequest) => {
    expect(autoCompactionRequest).toEqual({
      selectedModelId: "gpt-5.5",
      latestTokenUsage: { total: 390_000, input: 390_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
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
        reason: "context_usage_reserved_token_limit_reached",
        selectedModelId: "gpt-5.5",
        contextTokensUsed: 390_000,
        contextUsageRatio: 390_000 / 400_000,
        contextWindowTokenCapacity: 400_000,
        contextCompactionTriggerTokenCount: 380_000,
        reservedTokenCount: 20_000,
        thresholdRatio: undefined,
        triggerKind: "reserved_token_count",
        sessionEntryCountAfterLatestCompactionSummary: 3,
      },
      conversationSessionEntries,
    };
  };
  const completedAutoCompactionResult = await Promise.resolve(
    autoCompactCurrentConversationSession({
      selectedModelId: "gpt-5.5",
      latestTokenUsage: { total: 390_000, input: 390_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    }),
  );
  if (!completedAutoCompactionResult.didCompact) {
    throw new Error("expected auto-compaction to run");
  }

  expect(completedAutoCompactionResult.decision.reason).toBe("context_usage_reserved_token_limit_reached");
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

test("FileConversationSessionStore uses a workspace-scoped default path and prompt cache key", () => {
  const workspaceRootPath = join(tmpdir(), "buli-workspace-a");
  const otherWorkspaceRootPath = join(tmpdir(), "buli-workspace-b");

  const sessionStore = new FileConversationSessionStore({ workspaceRootPath });
  const otherSessionStore = new FileConversationSessionStore({ workspaceRootPath: otherWorkspaceRootPath });

  expect(sessionStore.filePath).toContain("conversation-sessions");
  expect(sessionStore.filePath).toBe(defaultConversationSessionFilePath({ workspaceRootPath }));
  expect(sessionStore.filePath).not.toBe(otherSessionStore.filePath);
  expect(sessionStore.promptCacheKey.startsWith("buli:")).toBe(true);
  expect(sessionStore.promptCacheKey).not.toBe(otherSessionStore.promptCacheKey);
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
