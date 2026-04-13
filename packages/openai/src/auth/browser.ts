import open from "open";
import { OpenAiCallbackServer } from "./callback-server.ts";
import type { OpenAiAuthInfo } from "./schema.ts";
import { buildAuthorizeUrl, createOAuthState, createPkcePair } from "./pkce.ts";
import { exchangeAuthorizationCode, toAuthInfo } from "./refresh.ts";
import { OpenAiAuthStore } from "./store.ts";

export type BrowserLauncher = (url: string) => Promise<void>;

export async function openBrowser(url: string): Promise<void> {
  await open(url);
}

export async function loginWithBrowser(input: {
  store?: OpenAiAuthStore;
  server?: OpenAiCallbackServer;
  openUrl?: BrowserLauncher;
  fetchImpl?: typeof fetch | undefined;
  issuer?: string | undefined;
} = {}): Promise<OpenAiAuthInfo> {
  const store = input.store ?? new OpenAiAuthStore();
  const server = input.server ?? new OpenAiCallbackServer();
  const pkce = await createPkcePair();
  const state = createOAuthState();

  const { redirectUri } = await server.start();

  const url = buildAuthorizeUrl({
    redirectUri,
    challenge: pkce.challenge,
    state,
    issuer: input.issuer,
  });

  const pending = server.waitForCode(state);

  try {
    await (input.openUrl ?? openBrowser)(url);
    const callback = await pending;

    const tokens = await exchangeAuthorizationCode({
      code: callback.code,
      redirectUri,
      verifier: pkce.verifier,
      issuer: input.issuer,
      fetchImpl: input.fetchImpl,
    });
    const auth = toAuthInfo({ tokens });
    await store.saveOpenAi(auth);
    return auth;
  } finally {
    await server.stop({ rejectPending: false });
  }
}
