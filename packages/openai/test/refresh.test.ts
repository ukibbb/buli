import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exchangeAuthorizationCode, refreshAccessToken, refreshStoredAuth, toAuthInfo } from "../src/auth/refresh.ts";
import { OpenAiAuthStore } from "../src/auth/store.ts";

async function withTokenServer(
  handler: (body: URLSearchParams) => Record<string, unknown>,
  run: (issuer: string) => Promise<void>,
): Promise<void> {
  let serverBody = "";
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      serverBody += chunk;
    });
    request.on("end", () => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(handler(new URLSearchParams(serverBody))));
      serverBody = "";
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("token test server address unavailable");
  }

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

test("exchangeAuthorizationCode posts the expected OAuth form", async () => {
  await withTokenServer(
    (body) => {
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("auth-code");
      expect(body.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");
      expect(body.get("code_verifier")).toBe("verifier");

      return {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
      };
    },
    async (issuer) => {
      const tokens = await exchangeAuthorizationCode({
        code: "auth-code",
        redirectUri: "http://localhost:1455/auth/callback",
        verifier: "verifier",
        issuer,
      });

      expect(tokens.access_token).toBe("access-token");
      expect(tokens.refresh_token).toBe("refresh-token");
    },
  );
});

test("exchangeAuthorizationCode handles trailing slash issuers", async () => {
  const requestedUrls: string[] = [];
  const fetchImpl: typeof fetch = Object.assign(
    async (url: Parameters<typeof fetch>[0]) => {
      requestedUrls.push(String(url));
      return new Response(JSON.stringify({ access_token: "access-token", refresh_token: "refresh-token" }), {
        headers: { "Content-Type": "application/json" },
      });
    },
    { preconnect: fetch.preconnect.bind(fetch) },
  );

  await exchangeAuthorizationCode({
    code: "auth-code",
    redirectUri: "http://localhost:1455/auth/callback",
    verifier: "verifier",
    issuer: "https://auth.example.com/",
    fetchImpl,
  });

  expect(requestedUrls).toEqual(["https://auth.example.com/oauth/token"]);
});

test("refreshAccessToken posts the refresh token form", async () => {
  await withTokenServer(
    (body) => {
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("refresh-token");

      return {
        access_token: "next-access",
        refresh_token: "next-refresh",
        expires_in: 7200,
      };
    },
    async (issuer) => {
      const tokens = await refreshAccessToken({
        refreshToken: "refresh-token",
        issuer,
      });

      expect(tokens.access_token).toBe("next-access");
      expect(tokens.refresh_token).toBe("next-refresh");
    },
  );
});

test("toAuthInfo converts token responses into stored auth", () => {
  const auth = toAuthInfo({
    now: 1_700_000_000_000,
    tokens: {
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 1800,
    },
    accountId: "acct_123",
  });

  expect(auth.provider).toBe("openai");
  expect(auth.accountId).toBe("acct_123");
  expect(auth.expiresAt).toBe(1_700_000_000_000 + 1_800_000);
});

test("refreshStoredAuth refreshes and persists an expired token", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-refresh-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: 10,
    accountId: "acct_123",
  });

  await withTokenServer(
    (body) => {
      expect(body.get("refresh_token")).toBe("old-refresh");

      return {
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
      };
    },
    async (issuer) => {
      const auth = await refreshStoredAuth({
        store,
        issuer,
        now: 100,
      });

      expect(auth?.accessToken).toBe("new-access");
      expect(auth?.refreshToken).toBe("new-refresh");
    },
  );

  const stored = await store.loadOpenAi();
  expect(stored?.accessToken).toBe("new-access");
  expect(stored?.accountId).toBe("acct_123");
});

test("refreshStoredAuth preserves the stored refresh token when refresh omits a replacement", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-refresh-preserve-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: 10,
    accountId: "acct_123",
  });

  await withTokenServer(
    () => ({
      access_token: "new-access",
      expires_in: 3600,
    }),
    async (issuer) => {
      const auth = await refreshStoredAuth({
        store,
        issuer,
        now: 100,
      });

      expect(auth?.accessToken).toBe("new-access");
      expect(auth?.refreshToken).toBe("old-refresh");
    },
  );
});

test("refreshStoredAuth refreshes before expiry using a safety window", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-refresh-skew-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: 1_000 + 60_000,
  });

  await withTokenServer(
    () => ({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
    }),
    async (issuer) => {
      const auth = await refreshStoredAuth({
        store,
        issuer,
        now: 1_000,
      });

      expect(auth?.accessToken).toBe("new-access");
      expect(auth?.refreshToken).toBe("new-refresh");
    },
  );
});

test("refreshStoredAuth does not overwrite credentials refreshed by another process", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-refresh-race-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: 10,
    accountId: "acct_123",
  });

  const fetchImpl: typeof fetch = Object.assign(
    async () => {
      await store.saveOpenAi({
        provider: "openai",
        method: "oauth",
        accessToken: "newer-access",
        refreshToken: "newer-refresh",
        expiresAt: 1_000_000,
        accountId: "acct_123",
      });
      return new Response(JSON.stringify({
        access_token: "stale-new-access",
        refresh_token: "stale-new-refresh",
        expires_in: 3600,
      }), { headers: { "Content-Type": "application/json" } });
    },
    { preconnect: fetch.preconnect.bind(fetch) },
  );

  const auth = await refreshStoredAuth({
    store,
    issuer: "https://example.test",
    fetchImpl,
    now: 100,
  });

  expect(auth?.accessToken).toBe("newer-access");
  expect(auth?.refreshToken).toBe("newer-refresh");
  expect(await store.loadOpenAi()).toMatchObject({
    accessToken: "newer-access",
    refreshToken: "newer-refresh",
  });
});

test("refreshStoredAuth refreshes a stale credential snapshot written by another process", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-refresh-stale-race-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const requestedRefreshTokens: string[] = [];

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: 10,
    accountId: "acct_123",
  });

  const fetchImpl: typeof fetch = Object.assign(
    async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const body = new URLSearchParams(String(init?.body ?? ""));
      requestedRefreshTokens.push(body.get("refresh_token") ?? "");
      if (requestedRefreshTokens.length === 1) {
        await store.saveOpenAi({
          provider: "openai",
          method: "oauth",
          accessToken: "concurrent-stale-access",
          refreshToken: "concurrent-stale-refresh",
          expiresAt: 20,
          accountId: "acct_123",
        });
      }

      return new Response(JSON.stringify({
        access_token: `refreshed-${requestedRefreshTokens.length}`,
        refresh_token: `refresh-${requestedRefreshTokens.length}`,
        expires_in: 3600,
      }), { headers: { "Content-Type": "application/json" } });
    },
    { preconnect: fetch.preconnect.bind(fetch) },
  );

  const auth = await refreshStoredAuth({
    store,
    issuer: "https://example.test",
    fetchImpl,
    now: 100,
  });

  expect(requestedRefreshTokens).toEqual(["old-refresh", "concurrent-stale-refresh"]);
  expect(auth?.accessToken).toBe("refreshed-2");
  expect(await store.loadOpenAi()).toMatchObject({
    accessToken: "refreshed-2",
    refreshToken: "refresh-2",
  });
});
