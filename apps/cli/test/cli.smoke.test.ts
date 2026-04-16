import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenAiAuthStore } from "@buli/openai";
import { main } from "../src/cli.ts";
import { runInteractiveChat } from "../src/commands/chat.ts";
import { runListAvailableModels } from "../src/commands/models.ts";
import { type InteractiveChatStartOptions, runCli } from "../src/main.ts";

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

  expect(output).toBe("Usage: buli [login|models] [--model <id>] [--reasoning <none|minimal|low|medium|high|xhigh>] [--ui <ink|opentui>]");
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

  expect(output).toBe("Usage: buli [login|models] [--model <id>] [--reasoning <none|minimal|low|medium|high|xhigh>] [--ui <ink|opentui>]");
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

test("runCli returns usage when a startup flag is invalid", async () => {
  const output = await runCli(["--reasoning", "wrong"], {
    runInteractiveChat: async () => "delegated start",
    runListAvailableModels: async () => "delegated models",
    runLogin: async () => "delegated login",
  });

  expect(output).toBe("Usage: buli [login|models] [--model <id>] [--reasoning <none|minimal|low|medium|high|xhigh>] [--ui <ink|opentui>]");
});

test("dispatches_interactive_chat_with_opentui_when_ui_flag_set_to_opentui", async () => {
  let capturedInteractiveChatStartOptions: InteractiveChatStartOptions | undefined;
  const stubbedCommandHandlers = {
    runInteractiveChat: async (options: InteractiveChatStartOptions = {}) => {
      capturedInteractiveChatStartOptions = options;
      return "";
    },
    runListAvailableModels: async () => "",
    runLogin: async () => "",
  };
  await runCli(["--ui", "opentui"], stubbedCommandHandlers);
  expect(capturedInteractiveChatStartOptions?.selectedTerminalUserInterface).toBe("opentui");
});

test("dispatches_interactive_chat_with_ink_when_ui_flag_set_to_ink", async () => {
  let capturedInteractiveChatStartOptions: InteractiveChatStartOptions | undefined;
  const stubbedCommandHandlers = {
    runInteractiveChat: async (options: InteractiveChatStartOptions = {}) => {
      capturedInteractiveChatStartOptions = options;
      return "";
    },
    runListAvailableModels: async () => "",
    runLogin: async () => "",
  };
  await runCli(["--ui", "ink"], stubbedCommandHandlers);
  expect(capturedInteractiveChatStartOptions?.selectedTerminalUserInterface).toBe("ink");
});

test("returns_usage_when_ui_flag_value_is_invalid", async () => {
  const stubbedCommandHandlers = {
    runInteractiveChat: async () => "",
    runListAvailableModels: async () => "",
    runLogin: async () => "",
  };
  const commandOutput = await runCli(["--ui", "bogus"], stubbedCommandHandlers);
  expect(commandOutput).toContain("Usage:");
});

test("defaults_selectedTerminalUserInterface_to_undefined_when_no_ui_flag_provided", async () => {
  let capturedInteractiveChatStartOptions: InteractiveChatStartOptions | undefined;
  const stubbedCommandHandlers = {
    runInteractiveChat: async (options: InteractiveChatStartOptions = {}) => {
      capturedInteractiveChatStartOptions = options;
      return "";
    },
    runListAvailableModels: async () => "",
    runLogin: async () => "",
  };
  await runCli([], stubbedCommandHandlers);
  expect(capturedInteractiveChatStartOptions?.selectedTerminalUserInterface).toBeUndefined();
});

test("runInteractiveChat returns a clean message when auth is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await expect(runInteractiveChat({ store })).resolves.toBe("OpenAI auth not found. Run `buli login`.");
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

  await expect(runInteractiveChat({ store, stdin: { isTTY: false } })).resolves.toBe(
    "Interactive chat requires a TTY. Run `buli` in a terminal.",
  );
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

  expect(outputs).toEqual(["Usage: buli [login|models] [--model <id>] [--reasoning <none|minimal|low|medium|high|xhigh>] [--ui <ink|opentui>]"]);
});
