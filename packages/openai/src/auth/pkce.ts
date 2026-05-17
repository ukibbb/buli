import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { OPENAI_CLIENT_ID, OPENAI_ISSUER } from "./constants.ts";

const TOKEN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
const TOKEN_CHARACTER_SET_RANDOM_BYTE_LIMIT = Math.floor(256 / TOKEN_CHARS.length) * TOKEN_CHARS.length;

export type PkcePair = {
  verifier: string;
  challenge: string;
};

const TokenClaimsSchema = z.object({
  chatgpt_account_id: z.string().optional(),
  organizations: z.array(z.object({ id: z.string() })).optional(),
  email: z.string().optional(),
  "https://api.openai.com/auth": z.object({
    chatgpt_account_id: z.string().optional(),
  }).optional(),
}).passthrough();

export type TokenClaims = z.infer<typeof TokenClaimsSchema>;

function createToken(length: number): string {
  let token = "";
  while (token.length < length) {
    const bytes = randomBytes(length - token.length);
    for (const byte of bytes) {
      if (byte >= TOKEN_CHARACTER_SET_RANDOM_BYTE_LIMIT) {
        continue;
      }

      token += TOKEN_CHARS[byte % TOKEN_CHARS.length];
      if (token.length === length) {
        break;
      }
    }
  }

  return token;
}

function buildIssuerUrl(input: { issuer?: string | undefined; pathname: string }): string {
  return new URL(input.pathname, input.issuer ?? OPENAI_ISSUER).toString();
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

  const authorizeUrl = new URL(buildIssuerUrl({ issuer: input.issuer, pathname: "/oauth/authorize" }));
  authorizeUrl.search = params.toString();
  return authorizeUrl.toString();
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
    const parsedClaims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    const validatedClaims = TokenClaimsSchema.safeParse(parsedClaims);
    return validatedClaims.success ? validatedClaims.data : undefined;
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
