import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConversationSessionEntry, ReasoningEffort } from "@buli/contracts";
import { AssistantConversationRuntime } from "@buli/engine";
import { OpenAiAuthStore } from "@buli/openai";
import { main } from "../src/cli.ts";
import { runInteractiveChat } from "../src/commands/chat.ts";
import {
  defaultConversationSessionFilePath,
  FileConversationSessionStore,
  type ConversationSessionStore,
} from "../src/conversationSessionStore.ts";
import { runListAvailableModels } from "../src/commands/models.ts";
import { type InteractiveChatStartOptions, runCli } from "../src/main.ts";

const CLI_USAGE = "Usage: buli [login|models] [--model <id>] [--reasoning <none|minimal|low|medium|high|xhigh>] [--bash-approval <risk_based|trusted>]";

test("runCli delegates the login command", async () => {
  const output = await runCli(["login"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runLogin: async () => "delegated login",
  });

  expect(output).toBe("delegated login");
});

test("runCli delegates the models command", async () => {
  const output = await runCli(["models"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runLogin: async () => "delegated login",
  });

  expect(output).toBe("delegated models");
});

test("runCli returns usage for unknown commands", async () => {
  const output = await runCli(["unknown"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runLogin: async () => "delegated login",
  });

  expect(output).toBe(CLI_USAGE);
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
  expect(output).toBe("delegated start");
});

test("runCli returns usage for the removed chat alias", async () => {
  const output = await runCli(["chat"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runLogin: async () => "delegated login",
  });

  expect(output).toBe(CLI_USAGE);
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
  expect(output).toBe("delegated start");
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
  expect(output).toBe("delegated start");
});

test("runCli returns usage when a startup flag is invalid", async () => {
  const output = await runCli(["--reasoning", "wrong"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runLogin: async () => "delegated login",
  });

  expect(output).toBe(CLI_USAGE);
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

test("runInteractiveChat passes the known default model reasoning effort to the renderer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  let receivedSelection: {
    selectedModelId: string;
    selectedModelDefaultReasoningEffort: ReasoningEffort | undefined;
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
      };
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  });

  expect(output).toBe("");
  expect(receivedSelection).toEqual({
    selectedModelId: "gpt-5.5",
    selectedModelDefaultReasoningEffort: "medium",
  });
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
    listConversationSessions: () => [
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
    ],
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
  } satisfies ConversationSessionStore;
  let capturedConversationRuntime: AssistantConversationRuntime | undefined;
  let capturedClearConversation: (() => void) | undefined;
  let capturedSwitchConversationSession:
    | ((conversationSessionId: string) =>
      | Promise<{ conversationSessionId: string; conversationSessionEntries: readonly ConversationSessionEntry[] }>
      | { conversationSessionId: string; conversationSessionEntries: readonly ConversationSessionEntry[] })
    | undefined;
  let capturedExportCurrentConversationSession:
    | (() => Promise<{ exportFilePath: string; exportFileUrl: string }> | { exportFilePath: string; exportFileUrl: string })
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
      capturedExportCurrentConversationSession = renderInput.exportCurrentConversationSession;
      expect(renderInput.initialConversationSessionEntries).toEqual(initialConversationSessionEntries);
      expect(renderInput.initialConversationSessionId).toBe("session-a");
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  });

  expect(output).toBe("");
  expect(capturedConversationRuntime?.conversationHistory.listConversationSessionEntries()).toEqual(initialConversationSessionEntries);

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

  console.log = (value?: unknown) => {
    outputs.push(String(value ?? ""));
  };

  try {
    await main(["unknown"]);
  } finally {
    console.log = originalLog;
  }

  expect(outputs).toEqual([CLI_USAGE]);
});
