import { Box, Text } from "ink";
import React from "react";
import { chatScreenTheme } from "../chatScreenTheme.ts";
import { glyphs } from "./glyphs.ts";

// Renders the HERO 1 top bar (pen frame cbMSE). The left slot shows a green
// connection indicator plus the current working directory. The right slot
// carries two chips — mode (always green-bordered when active) and model —
// and a close icon. Mode switching is intentionally not wired this round.
export type TopBarProps = {
  workingDirectoryPath: string;
  modeLabel: string;
  modelIdentifier: string;
  reasoningEffortLabel: string;
};

export function TopBar(props: TopBarProps) {
  return (
    <Box
      backgroundColor={chatScreenTheme.surfaceOne}
      paddingX={2}
      justifyContent="space-between"
      gap={1}
    >
      <Box gap={1} alignItems="center">
        <Text color={chatScreenTheme.accentGreen}>{glyphs.statusDot}</Text>
        <Text color={chatScreenTheme.textSecondary}>{props.workingDirectoryPath}</Text>
      </Box>
      <Box gap={1} alignItems="center">
        <Box borderStyle="round" borderColor={chatScreenTheme.accentGreen} paddingX={1}>
          <Text color={chatScreenTheme.accentGreen}>
            {`${glyphs.statusDot} ${props.modeLabel}`}
          </Text>
        </Box>
        <Box borderStyle="round" borderColor={chatScreenTheme.border} paddingX={1}>
          <Text color={chatScreenTheme.textSecondary}>
            {`${props.modelIdentifier} · ${props.reasoningEffortLabel}`}
          </Text>
        </Box>
        <Text color={chatScreenTheme.textMuted}>{glyphs.close}</Text>
      </Box>
    </Box>
  );
}
