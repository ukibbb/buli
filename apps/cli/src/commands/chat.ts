import { AgentRuntime } from "@buli/engine";
import { renderInkApp } from "@buli/ink-tui";
import { OpenAiAuthStore, OpenAiProvider } from "@buli/openai";

const DEFAULT_MODEL = "gpt-5.4";

export async function runChat(input: {
  model?: string;
  store?: OpenAiAuthStore;
  stdin?: Pick<NodeJS.ReadStream, "isTTY">;
} = {}): Promise<string> {
  const store = input.store ?? new OpenAiAuthStore();
  const auth = await store.loadOpenAi();
  if (!auth) {
    return "OpenAI auth not found. Run `buli login`.";
  }

  const stdin = input.stdin ?? process.stdin;
  if (!stdin.isTTY) {
    return "Interactive chat requires a TTY. Run `buli chat` in a terminal.";
  }

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
