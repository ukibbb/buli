import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenAiAuthStore } from "@buli/openai";
import { main } from "../src/cli.ts";
import { runChat } from "../src/commands/chat.ts";
import { runCli } from "../src/main.ts";

test("runCli delegates the login command", async () => {
  const output = await runCli(["login"], {
    login: async () => "delegated login",
    chat: async () => "delegated chat",
  });

  expect(output).toBe("delegated login");
});

test("runCli returns usage for unknown commands", async () => {
  const output = await runCli(["unknown"], {
    login: async () => "delegated login",
    chat: async () => "delegated chat",
  });

  expect(output).toBe("Usage: buli <login|chat>");
});

test("runCli delegates the chat command", async () => {
  const output = await runCli(["chat"], {
    login: async () => "delegated login",
    chat: async () => "delegated chat",
  });

  expect(output).toBe("delegated chat");
});

test("runChat returns a clean message when auth is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-chat-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await expect(runChat({ store })).resolves.toBe("OpenAI auth not found. Run `buli login`.");
});

test("runChat returns a clean message when stdin is not a TTY", async () => {
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

  await expect(runChat({ store, stdin: { isTTY: false } })).resolves.toBe(
    "Interactive chat requires a TTY. Run `buli chat` in a terminal.",
  );
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

  expect(outputs).toEqual(["Usage: buli <login|chat>"]);
});
