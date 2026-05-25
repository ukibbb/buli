import type { InteractiveChatEnvironment } from "../interactiveChat/interactiveChatEnvironment.ts";

export const INVALID_PROVIDER_HOST_COMMAND_MESSAGE =
  "Invalid BULI_PROVIDER_HOST_COMMAND. Use a JSON string array like [\"/path/to/provider\"].";

export type ProviderHostCommandResolution =
  | { status: "resolved"; providerHostCommand?: readonly string[] | undefined }
  | { status: "invalid" };

export function resolveProviderHostCommandFromEnvironment(input: {
  environment: InteractiveChatEnvironment;
}): ProviderHostCommandResolution {
  const providerHostCommandJson = input.environment.BULI_PROVIDER_HOST_COMMAND?.trim();
  if (!providerHostCommandJson) {
    return { status: "resolved" };
  }

  let parsedProviderHostCommand: unknown;
  try {
    parsedProviderHostCommand = JSON.parse(providerHostCommandJson) as unknown;
  } catch {
    return { status: "invalid" };
  }

  if (
    !Array.isArray(parsedProviderHostCommand) ||
    parsedProviderHostCommand.length === 0 ||
    !parsedProviderHostCommand.every((commandPart) => typeof commandPart === "string" && commandPart.trim().length > 0)
  ) {
    return { status: "invalid" };
  }

  return { status: "resolved", providerHostCommand: parsedProviderHostCommand };
}
