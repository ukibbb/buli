import { ReasoningEffortSchema, type ReasoningEffort } from "@buli/contracts";
import { runInteractiveChat } from "./commands/chat.ts";
import { runLogin } from "./commands/login.ts";
import { runListAvailableModels } from "./commands/models.ts";

export type InteractiveChatStartOptions = {
  selectedModelId?: string;
  selectedReasoningEffort?: ReasoningEffort;
};

type CommandHandlers = {
  runLogin: () => Promise<string>;
  runListAvailableModels: () => Promise<string>;
  runInteractiveChat: (input?: InteractiveChatStartOptions) => Promise<string>;
};

const defaultCommandHandlers: CommandHandlers = {
  runInteractiveChat,
  runListAvailableModels,
  runLogin,
};

const USAGE = "Usage: buli [login|models] [--model <id>] [--reasoning <none|minimal|low|medium|high|xhigh>]";

function parseInteractiveChatStartOptions(args: readonly string[]): InteractiveChatStartOptions | undefined {
  const interactiveChatStartOptions: InteractiveChatStartOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--model") {
      const selectedModelId = args[index + 1];
      if (!selectedModelId || selectedModelId.startsWith("--")) {
        return undefined;
      }

      interactiveChatStartOptions.selectedModelId = selectedModelId;
      index += 1;
      continue;
    }

    if (argument === "--reasoning") {
      const selectedReasoningEffort = args[index + 1];
      if (!selectedReasoningEffort || selectedReasoningEffort.startsWith("--")) {
        return undefined;
      }

      const parsedReasoningEffort = ReasoningEffortSchema.safeParse(selectedReasoningEffort);
      if (!parsedReasoningEffort.success) {
        return undefined;
      }

      interactiveChatStartOptions.selectedReasoningEffort = parsedReasoningEffort.data;
      index += 1;
      continue;
    }

    return undefined;
  }

  return interactiveChatStartOptions;
}

// Keep command dispatch free of process side effects so the same logic can be
// reused by tests, the source runner, and the built CLI wrapper.
export async function runCli(
  args: readonly string[],
  commandHandlers: CommandHandlers = defaultCommandHandlers,
): Promise<string> {
  const firstArgument = args[0];

  if (!firstArgument) {
    return commandHandlers.runInteractiveChat({});
  }

  if (firstArgument.startsWith("--")) {
    const interactiveChatStartOptions = parseInteractiveChatStartOptions(args);
    if (!interactiveChatStartOptions) {
      return USAGE;
    }

    return commandHandlers.runInteractiveChat(interactiveChatStartOptions);
  }

  switch (firstArgument) {
    case "login":
      return commandHandlers.runLogin();
    case "models":
      return commandHandlers.runListAvailableModels();
    default:
      return USAGE;
  }
}
