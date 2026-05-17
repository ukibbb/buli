import { expect, test } from "bun:test";
import { buildAuthorizeUrl, createOAuthState, createPkcePair, extractAccountId, parseJwtClaims } from "../src/auth/pkce.ts";

type JwtClaimsFixture = {
  chatgpt_account_id?: unknown;
  organizations?: unknown;
  email?: unknown;
  "https://api.openai.com/auth"?: unknown;
  readonly [claimName: string]: unknown;
};

function createJwt(payload: JwtClaimsFixture): string {
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
      redirectUri: "http://localhost:1455/auth/callback",
      challenge: "challenge",
      state: "state",
      issuer: "https://auth.example.com",
      clientId: "client-id",
    }),
  );

  expect(url.origin).toBe("https://auth.example.com");
  expect(url.searchParams.get("client_id")).toBe("client-id");
  expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");
  expect(url.searchParams.get("state")).toBe("state");
});

test("buildAuthorizeUrl handles trailing slash issuers", () => {
  const url = new URL(
    buildAuthorizeUrl({
      redirectUri: "http://localhost:1455/auth/callback",
      challenge: "challenge",
      state: "state",
      issuer: "https://auth.example.com/",
    }),
  );

  expect(url.toString()).toContain("https://auth.example.com/oauth/authorize?");
});

test("extractAccountId reads the ChatGPT account id from a token", () => {
  const token = createJwt({ chatgpt_account_id: "acct_123" });
  const claims = parseJwtClaims(token);

  expect(claims?.chatgpt_account_id).toBe("acct_123");
  expect(extractAccountId({ access_token: token })).toBe("acct_123");
});

test("parseJwtClaims rejects malformed claim shapes", () => {
  const token = createJwt({ chatgpt_account_id: 123 });

  expect(parseJwtClaims(token)).toBeUndefined();
  expect(extractAccountId({ access_token: token })).toBeUndefined();
});

test("extractAccountId reads nested auth and organization claims after validation", () => {
  expect(extractAccountId({
    access_token: createJwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct_nested" } }),
  })).toBe("acct_nested");
  expect(extractAccountId({ access_token: createJwt({ organizations: [{ id: "org_123" }] }) })).toBe("org_123");
});
