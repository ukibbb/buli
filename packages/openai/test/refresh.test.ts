import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exchangeAuthorizationCode, OpenAiAuthStore, refreshAccessToken, refreshStoredAuth, toAuthInfo } from "../src/index.ts";

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
      expect(body.get("redirect_uri")).toBe("http://127.0.0.1:1455/auth/callback");
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
        redirectUri: "http://127.0.0.1:1455/auth/callback",
        verifier: "verifier",
        issuer,
      });

      expect(tokens.access_token).toBe("access-token");
      expect(tokens.refresh_token).toBe("refresh-token");
    },
  );
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
