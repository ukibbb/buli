import { runChat } from "./commands/chat.ts";
import { runLogin } from "./commands/login.ts";

type Commands = {
  login: () => Promise<string>;
  start: () => Promise<string>;
};

const defaultCommands: Commands = {
  login: runLogin,
  start: runChat,
};

// Keep command dispatch free of process side effects so the same logic can be
// reused by tests, the source runner, and the built CLI wrapper.
export async function runCli(args: readonly string[], commands: Commands = defaultCommands): Promise<string> {
  const command = args[0];

  if (!command) {
    return commands.start();
  }

  switch (command) {
    case "login":
      return commands.login();
    default:
      return "Usage: buli [login]";
  }
}
