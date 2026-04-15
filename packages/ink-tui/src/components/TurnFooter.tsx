import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { TokenUsage } from "@buli/contracts";
import { chatScreenTheme } from "../chatScreenTheme.ts";
import { glyphs } from "./glyphs.ts";

// TurnFooter renders a one-row chip beneath an assistant turn so the user
// sees the cost / timing / model at a glance. Mirrors the pen-file
// component/TurnFooter: muted divider glyphs with accent numbers.
export type TurnFooterProps = {
  modelDisplayName: string;
  turnDurationMs: number;
  usage: TokenUsage;
};

export function TurnFooter(props: TurnFooterProps): ReactNode {
  const totalTokenCount = props.usage.total ?? props.usage.input + props.usage.output + props.usage.reasoning;
  return (
    <Box width="100%">
      <Text color={chatScreenTheme.textDim}>{glyphs.chevronRight}</Text>
      <Box marginLeft={1}>
        <Text color={chatScreenTheme.textMuted}>{props.modelDisplayName}</Text>
      </Box>
      <Box marginLeft={1}>
        <Text color={chatScreenTheme.textDim}>·</Text>
      </Box>
      <Box marginLeft={1}>
        <Text color={chatScreenTheme.accentPrimaryMuted}>{`${totalTokenCount} tok`}</Text>
      </Box>
      <Box marginLeft={1}>
        <Text color={chatScreenTheme.textDim}>·</Text>
      </Box>
      <Box marginLeft={1}>
        <Text color={chatScreenTheme.accentPrimaryMuted}>{formatTurnDurationMs(props.turnDurationMs)}</Text>
      </Box>
      {props.usage.reasoning > 0 ? (
        <>
          <Box marginLeft={1}>
            <Text color={chatScreenTheme.textDim}>·</Text>
          </Box>
          <Box marginLeft={1}>
            <Text color={chatScreenTheme.textMuted}>{`${props.usage.reasoning} reasoning`}</Text>
          </Box>
        </>
      ) : null}
      {props.usage.cache.read > 0 ? (
        <>
          <Box marginLeft={1}>
            <Text color={chatScreenTheme.textDim}>·</Text>
          </Box>
          <Box marginLeft={1}>
            <Text color={chatScreenTheme.textMuted}>{`${props.usage.cache.read} cached`}</Text>
          </Box>
        </>
      ) : null}
    </Box>
  );
}

function formatTurnDurationMs(turnDurationMs: number): string {
  if (turnDurationMs < 1000) {
    return `${turnDurationMs}ms`;
  }
  return `${(turnDurationMs / 1000).toFixed(1)}s`;
}
