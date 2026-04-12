import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loginWithBrowser, OpenAiAuthStore, OpenAiCallbackServer } from "../src/index.ts";

function createJwt(payload: object): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}

test("loginWithBrowser completes the OAuth flow and stores auth", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-browser-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const callbackServer = new OpenAiCallbackServer({ port: 0 });

  const tokenServer = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const params = new URLSearchParams(body);
      expect(params.get("grant_type")).toBe("authorization_code");
      expect(params.get("code")).toBe("auth-code");

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          id_token: createJwt({ chatgpt_account_id: "acct_123" }),
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
        }),
      );
    });
  });

  await new Promise<void>((resolve) => tokenServer.listen(0, "127.0.0.1", resolve));
  const address = tokenServer.address();
  if (!address || typeof address === "string") {
    throw new Error("browser auth test server address unavailable");
  }

  try {
    const auth = await loginWithBrowser({
      store,
      server: callbackServer,
      issuer: `http://127.0.0.1:${address.port}`,
      openUrl: async (url) => {
        const authUrl = new URL(url);
        const redirectUri = authUrl.searchParams.get("redirect_uri");
        const state = authUrl.searchParams.get("state");

        if (!redirectUri || !state) {
          throw new Error("missing redirect_uri or state");
        }

        const response = await fetch(`${redirectUri}?code=auth-code&state=${state}`);
        await response.text();
      },
    });

    expect(auth.accessToken).toBe("access-token");
    expect(auth.refreshToken).toBe("refresh-token");
    expect(auth.accountId).toBe("acct_123");

    const stored = await store.loadOpenAi();
    expect(stored?.accessToken).toBe("access-token");
    expect(stored?.accountId).toBe("acct_123");
  } finally {
    await new Promise<void>((resolve, reject) => {
      tokenServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});
