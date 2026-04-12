import { createHash, randomBytes } from "node:crypto";
import { OPENAI_CLIENT_ID, OPENAI_ISSUER } from "./constants.ts";

const TOKEN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

export type PkcePair = {
  verifier: string;
  challenge: string;
};

export type TokenClaims = {
  chatgpt_account_id?: string;
  organizations?: Array<{ id: string }>;
  email?: string;
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: string;
  };
};

function createToken(length: number): string {
  const bytes = randomBytes(length);

  return Array.from(bytes, (byte) => TOKEN_CHARS[byte % TOKEN_CHARS.length]).join("");
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = createToken(43);
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  return { verifier, challenge };
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function buildAuthorizeUrl(input: {
  redirectUri: string;
  challenge: string;
  state: string;
  issuer?: string | undefined;
  clientId?: string | undefined;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId ?? OPENAI_CLIENT_ID,
    redirect_uri: input.redirectUri,
    scope: "openid profile email offline_access",
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state: input.state,
    originator: "buli",
  });

  return `${input.issuer ?? OPENAI_ISSUER}/oauth/authorize?${params.toString()}`;
}

export function parseJwtClaims(token: string): TokenClaims | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return undefined;
  }

  const payload = parts[1];
  if (!payload) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenClaims;
  } catch {
    return undefined;
  }
}

export function extractAccountIdFromClaims(claims: TokenClaims): string | undefined {
  return (
    claims.chatgpt_account_id ??
    claims["https://api.openai.com/auth"]?.chatgpt_account_id ??
    claims.organizations?.[0]?.id
  );
}

export function extractAccountId(input: {
  id_token?: string | undefined;
  access_token?: string | undefined;
}): string | undefined {
  if (input.id_token) {
    const claims = parseJwtClaims(input.id_token);
    const accountId = claims ? extractAccountIdFromClaims(claims) : undefined;

    if (accountId) {
      return accountId;
    }
  }

  if (input.access_token) {
    const claims = parseJwtClaims(input.access_token);
    return claims ? extractAccountIdFromClaims(claims) : undefined;
  }

  return undefined;
}
