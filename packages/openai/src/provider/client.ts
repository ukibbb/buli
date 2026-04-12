import type { ProviderStreamEvent } from "@buli/contracts";
import { OPENAI_CODEX_API_ENDPOINT } from "../auth/constants.ts";
import { refreshStoredAuth } from "../auth/refresh.ts";
import { OpenAiAuthStore } from "../auth/store.ts";
import { parseOpenAiStream } from "./stream.ts";

export type OpenAiTurnInput = {
  prompt: string;
  model: string;
};

const DEFAULT_INSTRUCTIONS = "You are buli, a local terminal coding assistant. Answer directly and concisely.";

function createResponsesInput(prompt: string) {
  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: prompt,
        },
      ],
    },
  ];
}

async function createHttpError(response: Response): Promise<Error> {
  const body = (await response.text()).trim();
  const requestId =
    response.headers.get("x-request-id") ??
    response.headers.get("request-id") ??
    response.headers.get("openai-request-id");

  const parts = [`OpenAI stream request failed: ${response.status}`];
  if (body) {
    parts.push(body);
  }
  if (requestId) {
    parts.push(`request_id=${requestId}`);
  }

  return new Error(parts.join(" | "));
}

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
        instructions: DEFAULT_INSTRUCTIONS,
        store: false,
        // The Codex backend expects Responses-style message items, not a bare
        // prompt string. Keeping this conversion here isolates provider quirks
        // away from the engine and TUI layers.
        input: createResponsesInput(input.prompt),
        stream: true,
      }),
    });

    if (!response.ok) {
      throw await createHttpError(response);
    }

    yield* parseOpenAiStream(response);
  }
}
