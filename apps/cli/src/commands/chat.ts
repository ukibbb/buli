import { AgentRuntime } from "@buli/engine";
import { renderInkApp } from "@buli/ink-tui";
import { OpenAiAuthStore, OpenAiProvider, refreshStoredAuth } from "@buli/openai";

const DEFAULT_MODEL = "gpt-5.4";

export async function runChat(input: {
  model?: string;
  store?: OpenAiAuthStore;
} = {}): Promise<string> {
  const store = input.store ?? new OpenAiAuthStore();
  const auth = await store.loadOpenAi();
  if (!auth) {
    return "OpenAI auth not found. Run `buli login`.";
  }

  await refreshStoredAuth({ store });

  const provider = new OpenAiProvider({ store });
  const runtime = new AgentRuntime(provider);
  const app = renderInkApp({
    auth: "ready",
    model: input.model ?? DEFAULT_MODEL,
    runtime,
  });

  await app.waitUntilExit();
  return "";
}
