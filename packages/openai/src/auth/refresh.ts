import { z } from "zod";
import { fetchWithTimeout } from "../fetchWithTimeout.ts";
import { OPENAI_CLIENT_ID, OPENAI_ISSUER } from "./constants.ts";
import { extractAccountId } from "./pkce.ts";
import { OpenAiAuthInfoSchema, type OpenAiAuthInfo } from "./schema.ts";
import { OpenAiAuthStore } from "./store.ts";

const TokenResponseSchema = z.object({
  id_token: z.string().optional(),
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
});

const AUTH_REFRESH_EXPIRY_SKEW_MS = 5 * 60 * 1000;
const OPENAI_TOKEN_FETCH_TIMEOUT_MESSAGE = "OpenAI token request timed out";

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

async function parseTokenResponse(response: Response): Promise<TokenResponse> {
  if (!response.ok) {
    throw new Error(`OpenAI token request failed: ${response.status}`);
  }

  return TokenResponseSchema.parse(await response.json());
}

function buildTokenEndpointUrl(issuer: string | undefined): string {
  return new URL("/oauth/token", issuer ?? OPENAI_ISSUER).toString();
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  redirectUri: string;
  verifier: string;
  issuer?: string | undefined;
  clientId?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
  abortSignal?: AbortSignal | undefined;
  fetchTimeoutMilliseconds?: number | undefined;
}): Promise<TokenResponse> {
  const response = await fetchWithTimeout({
    resource: buildTokenEndpointUrl(input.issuer),
    fetchImpl: input.fetchImpl,
    abortSignal: input.abortSignal,
    timeoutMilliseconds: input.fetchTimeoutMilliseconds,
    timeoutErrorMessage: OPENAI_TOKEN_FETCH_TIMEOUT_MESSAGE,
    requestInit: {
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
    },
  });

  return parseTokenResponse(response);
}

export async function refreshAccessToken(input: {
  refresh: string;
  issuer?: string | undefined;
  clientId?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
  abortSignal?: AbortSignal | undefined;
  fetchTimeoutMilliseconds?: number | undefined;
}): Promise<TokenResponse> {
  const response = await fetchWithTimeout({
    resource: buildTokenEndpointUrl(input.issuer),
    fetchImpl: input.fetchImpl,
    abortSignal: input.abortSignal,
    timeoutMilliseconds: input.fetchTimeoutMilliseconds,
    timeoutErrorMessage: OPENAI_TOKEN_FETCH_TIMEOUT_MESSAGE,
    requestInit: {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: input.refresh,
        client_id: input.clientId ?? OPENAI_CLIENT_ID,
      }).toString(),
    },
  });

  return parseTokenResponse(response);
}

export function toAuthInfo(input: {
  tokens: TokenResponse;
  now?: number | undefined;
  accountId?: string | undefined;
  refresh?: string | undefined;
}): OpenAiAuthInfo {
  const refresh = input.tokens.refresh_token ?? input.refresh;
  if (!refresh) {
    throw new Error("OpenAI token response did not include a refresh token");
  }

  return OpenAiAuthInfoSchema.parse({
    type: "oauth",
    access: input.tokens.access_token,
    refresh,
    expires: (input.now ?? Date.now()) + (input.tokens.expires_in ?? 3600) * 1000,
    accountId: extractAccountId(input.tokens) ?? input.accountId,
  });
}

export async function refreshStoredAuth(input: {
  store: OpenAiAuthStore;
  issuer?: string | undefined;
  clientId?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
  abortSignal?: AbortSignal | undefined;
  fetchTimeoutMilliseconds?: number | undefined;
  now?: number | undefined;
}): Promise<OpenAiAuthInfo | undefined> {
  let auth = await input.store.loadOpenAi();

  const now = input.now ?? Date.now();
  while (auth) {
    if (isOpenAiAuthFreshEnough(auth, now)) {
      return auth;
    }

    const tokens = await refreshAccessToken({
      refresh: auth.refresh,
      issuer: input.issuer,
      clientId: input.clientId,
      fetchImpl: input.fetchImpl,
      abortSignal: input.abortSignal,
      fetchTimeoutMilliseconds: input.fetchTimeoutMilliseconds,
    });
    const next = toAuthInfo({
      tokens,
      now,
      accountId: auth.accountId,
      refresh: auth.refresh,
    });

    const latestAuth = await input.store.loadOpenAi();
    if (!latestAuth) {
      return undefined;
    }
    if (!isSameStoredAuthSnapshot(latestAuth, auth)) {
      auth = latestAuth;
      continue;
    }

    await input.store.saveOpenAi(next);
    return next;
  }

  return undefined;
}

export function isOpenAiAuthFreshEnough(auth: OpenAiAuthInfo, now: number = Date.now()): boolean {
  return auth.expires - now > AUTH_REFRESH_EXPIRY_SKEW_MS;
}

function isSameStoredAuthSnapshot(leftAuth: OpenAiAuthInfo, rightAuth: OpenAiAuthInfo): boolean {
  return leftAuth.type === rightAuth.type &&
    leftAuth.access === rightAuth.access &&
    leftAuth.refresh === rightAuth.refresh &&
    leftAuth.expires === rightAuth.expires &&
    leftAuth.accountId === rightAuth.accountId;
}
