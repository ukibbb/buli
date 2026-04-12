import type { ProviderStreamEvent } from "@buli/contracts";
import { OPENAI_CODEX_API_ENDPOINT } from "../auth/constants.ts";
import { refreshStoredAuth } from "../auth/refresh.ts";
import { OpenAiAuthStore } from "../auth/store.ts";
import { parseOpenAiStream } from "./stream.ts";

export type OpenAiTurnInput = {
  prompt: string;
  model: string;
};

export class OpenAiProvider {
  readonly endpoint: string;
  readonly store: OpenAiAuthStore;
  readonly fetchImpl: typeof fetch;

  constructor(input: {
    endpoint?: string;
    store?: OpenAiAuthStore;
    fetchImpl?: typeof fetch;
  } = {}) {
    this.endpoint = input.endpoint ?? OPENAI_CODEX_API_ENDPOINT;
    this.store = input.store ?? new OpenAiAuthStore();
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  async *streamTurn(input: OpenAiTurnInput): AsyncGenerator<ProviderStreamEvent> {
    const auth = await refreshStoredAuth({
      store: this.store,
      fetchImpl: this.fetchImpl,
    });

    if (!auth) {
      throw new Error("OpenAI auth not found. Run `buli login`.");
    }

    const headers = new Headers({
      authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      originator: "buli",
      "User-Agent": "buli/dev",
    });

    if (auth.accountId) {
      headers.set("ChatGPT-Account-Id", auth.accountId);
    }

    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.model,
        input: input.prompt,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI stream request failed: ${response.status}`);
    }

    yield* parseOpenAiStream(response);
  }
}
