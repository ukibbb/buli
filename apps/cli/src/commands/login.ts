import { loginWithBrowser } from "@buli/openai";

export async function runLogin(): Promise<string> {
  const auth = await loginWithBrowser();
  if (auth.accountId) {
    return `OpenAI login complete for account ${auth.accountId}`;
  }

  return "OpenAI login complete";
}
