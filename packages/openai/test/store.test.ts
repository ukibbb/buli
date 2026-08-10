import { expect, test } from "bun:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenAiAuthStoreSchema } from "../src/auth/schema.ts";
import { OpenAiAuthStore } from "../src/auth/store.ts";

test("OpenAiAuthStoreSchema parses an OpenAI OAuth store", () => {
  const store = OpenAiAuthStoreSchema.parse({
    openai: {
      type: "oauth",
      access: "access-token",
      refresh: "refresh-token",
      expires: 1_764_000_000,
      accountId: "acct_123",
    },
  });

  expect(store.openai?.type).toBe("oauth");
  expect(store.openai?.accountId).toBe("acct_123");
});

test("OpenAiAuthStore returns an empty store when the file is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-store-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  expect(await store.load()).toEqual({});
});

test("OpenAiAuthStore saves and loads OpenAI auth", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-store-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await store.saveOpenAi({
    type: "oauth",
    access: "access-token",
    refresh: "refresh-token",
    expires: 1_764_000_000,
    accountId: "acct_123",
  });

  const auth = await store.loadOpenAi();
  expect(auth?.access).toBe("access-token");
  expect(auth?.accountId).toBe("acct_123");
});

test("OpenAiAuthStore migrates the legacy Buli OAuth schema on load", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-store-migrate-"));
  const filePath = join(dir, "auth.json");
  await writeFile(filePath, JSON.stringify({
    openai: {
      provider: "openai",
      method: "oauth",
      accessToken: "legacy-access",
      refreshToken: "legacy-refresh",
      expiresAt: 1_764_000_000,
      accountId: "acct_legacy",
    },
  }));
  const store = new OpenAiAuthStore({ filePath });

  expect(await store.loadOpenAi()).toEqual({
    type: "oauth",
    access: "legacy-access",
    refresh: "legacy-refresh",
    expires: 1_764_000_000,
    accountId: "acct_legacy",
  });
  expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({
    openai: {
      type: "oauth",
      access: "legacy-access",
      refresh: "legacy-refresh",
      expires: 1_764_000_000,
      accountId: "acct_legacy",
    },
  });
});

test("OpenAiAuthStore saves OAuth tokens with private filesystem permissions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-store-private-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await store.saveOpenAi({
    type: "oauth",
    access: "access-token",
    refresh: "refresh-token",
    expires: 1_764_000_000,
  });

  expect((await stat(dir)).mode & 0o777).toBe(0o700);
  expect((await stat(join(dir, "auth.json"))).mode & 0o777).toBe(0o600);
});
