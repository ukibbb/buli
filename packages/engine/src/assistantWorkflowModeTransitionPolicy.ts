import {
  findLatestVisibleCompletedAssistantOperatingMode,
  type AssistantOperatingMode,
  type ConversationSessionEntry,
  type UserPromptSource,
} from "@buli/contracts";
import { formatAssistantOperatingModeName } from "./assistantOperatingModePolicy.ts";

export type AssistantWorkflowModeTransitionDecision =
  | {
    readonly transitionKind: "allowed";
  }
  | {
    readonly transitionKind: "denied";
    readonly denialText: string;
  };

export function resolveAssistantWorkflowModeTransition(input: {
  requestedAssistantOperatingMode: AssistantOperatingMode;
  conversationSessionEntries: readonly ConversationSessionEntry[];
  promptSource?: UserPromptSource | undefined;
}): AssistantWorkflowModeTransitionDecision {
  if (input.requestedAssistantOperatingMode === "understand") {
    return { transitionKind: "allowed" };
  }

  if (input.promptSource !== undefined) {
    return { transitionKind: "allowed" };
  }

  const latestCompletedAssistantOperatingMode = findLatestVisibleCompletedAssistantOperatingMode(input.conversationSessionEntries);

  if (input.requestedAssistantOperatingMode === "plan") {
    if (latestCompletedAssistantOperatingMode === "understand" || latestCompletedAssistantOperatingMode === "plan") {
      return { transitionKind: "allowed" };
    }

    return {
      transitionKind: "denied",
      denialText:
        "Plan Agent requires a completed Understand turn first. Runtime workflow is Understand -> Plan -> Implementation.",
    };
  }

  if (latestCompletedAssistantOperatingMode === "plan" || latestCompletedAssistantOperatingMode === "implementation") {
    return { transitionKind: "allowed" };
  }

  return {
    transitionKind: "denied",
    denialText:
      "Implementation Agent requires a completed Plan turn first. Runtime workflow is Understand -> Plan -> Implementation.",
  };
}

export function formatAssistantWorkflowModeTransitionDenialText(input: {
  requestedAssistantOperatingMode: AssistantOperatingMode;
  denialText: string;
}): string {
  return `${formatAssistantOperatingModeName(input.requestedAssistantOperatingMode)} cannot start yet. ${input.denialText}`;
}
