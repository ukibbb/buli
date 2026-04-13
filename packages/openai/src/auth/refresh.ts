import { z } from "zod";
import { OPENAI_CLIENT_ID, OPENAI_ISSUER } from "./constants.ts";
import { extractAccountId } from "./pkce.ts";
import { OpenAiAuthInfoSchema, type OpenAiAuthInfo } from "./schema.ts";
import { OpenAiAuthStore } from "./store.ts";

const TokenResponseSchema = z.object({
  id_token: z.string().optional(),
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().int().positive().optional(),
});

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

async function parseTokenResponse(response: Response): Promise<TokenResponse> {
  if (!response.ok) {
    throw new Error(`OpenAI token request failed: ${response.status}`);
  }

  return TokenResponseSchema.parse(await response.json());
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  redirectUri: string;
  verifier: string;
  issuer?: string | undefined;
  clientId?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}): Promise<TokenResponse> {
  const response = await (input.fetchImpl ?? fetch)(`${input.issuer ?? OPENAI_ISSUER}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.clientId ?? OPENAI_CLIENT_ID,
      code_verifier: input.verifier,
    }).toString(),
  });

  return parseTokenResponse(response);
}

export async function refreshAccessToken(input: {
  refreshToken: string;
  issuer?: string | undefined;
  clientId?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}): Promise<TokenResponse> {
  const response = await (input.fetchImpl ?? fetch)(`${input.issuer ?? OPENAI_ISSUER}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
      client_id: input.clientId ?? OPENAI_CLIENT_ID,
    }).toString(),
  });

  return parseTokenResponse(response);
}

export function toAuthInfo(input: {
  tokens: TokenResponse;
  now?: number | undefined;
  accountId?: string | undefined;
}): OpenAiAuthInfo {
  return OpenAiAuthInfoSchema.parse({
    provider: "openai",
    method: "oauth",
    accessToken: input.tokens.access_token,
    refreshToken: input.tokens.refresh_token,
    expiresAt: (input.now ?? Date.now()) + (input.tokens.expires_in ?? 3600) * 1000,
    accountId: extractAccountId(input.tokens) ?? input.accountId,
  });
}

export async function refreshStoredAuth(input: {
  store: OpenAiAuthStore;
  issuer?: string | undefined;
  clientId?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
  now?: number | undefined;
}): Promise<OpenAiAuthInfo | undefined> {
  const auth = await input.store.loadOpenAi();
  if (!auth) {
    return undefined;
  }

  const now = input.now ?? Date.now();
  if (auth.expiresAt > now) {
    return auth;
  }

  const tokens = await refreshAccessToken({
    refreshToken: auth.refreshToken,
    issuer: input.issuer,
    clientId: input.clientId,
    fetchImpl: input.fetchImpl,
  });
  const next = toAuthInfo({
    tokens,
    now,
    accountId: auth.accountId,
  });

  await input.store.saveOpenAi(next);
  return next;
}
