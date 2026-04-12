import { expect, test } from "bun:test";
import { buildAuthorizeUrl, createOAuthState, createPkcePair, extractAccountId, parseJwtClaims } from "../src/index.ts";

function createJwt(payload: object): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}

test("createPkcePair creates a verifier and challenge", async () => {
  const pkce = await createPkcePair();

  expect(pkce.verifier).toHaveLength(43);
  expect(pkce.challenge.length).toBeGreaterThan(20);
  expect(pkce.challenge.includes("=")).toBe(false);
});

test("createOAuthState creates a non-empty state", () => {
  const state = createOAuthState();

  expect(state.length).toBeGreaterThan(20);
});

test("buildAuthorizeUrl includes the expected oauth query", () => {
  const url = new URL(
    buildAuthorizeUrl({
      redirectUri: "http://127.0.0.1:1455/auth/callback",
      challenge: "challenge",
      state: "state",
      issuer: "https://auth.example.com",
      clientId: "client-id",
    }),
  );

  expect(url.origin).toBe("https://auth.example.com");
  expect(url.searchParams.get("client_id")).toBe("client-id");
  expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:1455/auth/callback");
  expect(url.searchParams.get("state")).toBe("state");
});

test("extractAccountId reads the ChatGPT account id from a token", () => {
  const token = createJwt({ chatgpt_account_id: "acct_123" });
  const claims = parseJwtClaims(token);

  expect(claims?.chatgpt_account_id).toBe("acct_123");
  expect(extractAccountId({ access_token: token })).toBe("acct_123");
});
