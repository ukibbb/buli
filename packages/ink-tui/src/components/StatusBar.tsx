import type { TokenUsage } from "@buli/contracts";
import { Text } from "ink";
import type { AuthState, RuntimeState } from "../state.ts";

export type StatusBarProps = {
  auth: AuthState;
  model: string;
  runtime: RuntimeState;
  usage: TokenUsage | undefined;
};

function formatUsage(usage: TokenUsage | undefined): string | undefined {
  if (!usage) {
    return undefined;
  }

  if (usage.reasoning > 0) {
    return `In ${usage.input} | Out ${usage.output} | Reasoning ${usage.reasoning}`;
  }

  return `In ${usage.input} | Out ${usage.output}`;
}

export function StatusBar(props: StatusBarProps) {
  const parts = [
    `Auth ${props.auth}`,
    `Model ${props.model}`,
    `Status ${props.runtime}`,
  ];
  const usage = formatUsage(props.usage);
  if (usage) {
    parts.push(usage);
  }

  return <Text dimColor>{parts.join(" | ")}</Text>;
}
