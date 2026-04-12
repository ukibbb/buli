import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenAiAuthStore } from "../src/index.ts";

test("OpenAiAuthStore returns an empty store when the file is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-store-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  expect(await store.load()).toEqual({});
});

test("OpenAiAuthStore saves and loads OpenAI auth", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-store-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: 1_764_000_000,
    accountId: "acct_123",
  });

  const auth = await store.loadOpenAi();
  expect(auth?.accessToken).toBe("access-token");
  expect(auth?.accountId).toBe("acct_123");
});
