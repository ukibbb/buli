import { loginWithBrowser } from "@buli/openai";

export type LoginCommandOptions = {
  loginWithBrowser?: typeof loginWithBrowser;
};

export async function runLogin(options: LoginCommandOptions = {}): Promise<string> {
  const auth = await (options.loginWithBrowser ?? loginWithBrowser)();
  if (auth.accountId) {
    return `OpenAI login complete for account ${auth.accountId}`;
  }

  return "OpenAI login complete";
}
