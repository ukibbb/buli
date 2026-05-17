import { ReasoningEffortSchema, type ReasoningEffort } from "@buli/contracts";
import { parseBashToolApprovalMode, type BashToolApprovalMode } from "@buli/engine";
import { runInteractiveChat } from "./commands/chat.ts";
import { runLogin } from "./commands/login.ts";
import { runListAvailableModels } from "./commands/models.ts";

export type InteractiveChatStartOptions = {
  selectedModelId?: string;
  selectedReasoningEffort?: ReasoningEffort;
  bashToolApprovalMode?: BashToolApprovalMode;
};

type CommandHandlers = {
  runLogin: () => Promise<string>;
  runListAvailableModels: () => Promise<string>;
  runInteractiveChat: (input?: InteractiveChatStartOptions) => Promise<string>;
};

export type CliRunResult =
  | { status: "ok"; output: string }
  | { status: "usage_error"; output: string };

const defaultCommandHandlers: CommandHandlers = {
  runInteractiveChat,
  runListAvailableModels,
  runLogin,
};

export const USAGE = "Usage: buli [login|models|help] [--model <id>] [--reasoning <none|minimal|low|medium|high|xhigh>] [--bash-approval <risk_based|trusted>]";

function ok(output: string): CliRunResult {
  return { status: "ok", output };
}

function usageError(): CliRunResult {
  return { status: "usage_error", output: USAGE };
}

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

    if (argument === "--bash-approval") {
      const selectedBashToolApprovalMode = args[index + 1];
      if (!selectedBashToolApprovalMode || selectedBashToolApprovalMode.startsWith("--")) {
        return undefined;
      }

      const parsedBashToolApprovalMode = parseBashToolApprovalMode(selectedBashToolApprovalMode);
      if (!parsedBashToolApprovalMode) {
        return undefined;
      }

      interactiveChatStartOptions.bashToolApprovalMode = parsedBashToolApprovalMode;
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
): Promise<CliRunResult> {
  const firstArgument = args[0];

  if (!firstArgument) {
    return ok(await commandHandlers.runInteractiveChat({}));
  }

  if (firstArgument === "help" || firstArgument === "--help" || firstArgument === "-h") {
    return ok(USAGE);
  }

  if (firstArgument.startsWith("--")) {
    const interactiveChatStartOptions = parseInteractiveChatStartOptions(args);
    if (!interactiveChatStartOptions) {
      return usageError();
    }

    return ok(await commandHandlers.runInteractiveChat(interactiveChatStartOptions));
  }

  switch (firstArgument) {
    case "login":
      return ok(await commandHandlers.runLogin());
    case "models":
      return ok(await commandHandlers.runListAvailableModels());
    default:
      return usageError();
  }
}
