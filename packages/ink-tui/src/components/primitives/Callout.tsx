import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "../glyphs.ts";

import type { CalloutSeverity } from "@buli/contracts";
export type { CalloutSeverity };

// Callouts attach an accent colour, icon, and optional title to a prose block.
// The four severity levels mirror the pen-file components
// CalloutInfo / Success / Warn / Error so the design's visual grammar is
// preserved in the terminal.

export type CalloutProps = {
  severity: CalloutSeverity;
  titleText?: string;
  bodyContent: ReactNode;
};

const severityAccentColors: Record<CalloutSeverity, string> = {
  info: chatScreenTheme.accentCyan,
  success: chatScreenTheme.accentGreen,
  warning: chatScreenTheme.accentAmber,
  error: chatScreenTheme.accentRed,
};

const severityBackgroundColors: Record<CalloutSeverity, string> = {
  info: chatScreenTheme.calloutInfoBg,
  success: chatScreenTheme.calloutSuccessBg,
  warning: chatScreenTheme.calloutWarningBg,
  error: chatScreenTheme.calloutErrorBg,
};

const severityGlyphs: Record<CalloutSeverity, string> = {
  info: "ⓘ",
  success: glyphs.checkMark,
  warning: "!",
  error: glyphs.close,
};

export function Callout(props: CalloutProps): ReactNode {
  const accentColor = severityAccentColors[props.severity];
  const backgroundColor = severityBackgroundColors[props.severity];
  return (
    <Box
      backgroundColor={backgroundColor}
      borderColor={accentColor}
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      width="100%"
    >
      <Box>
        <Text color={accentColor}>
          {severityGlyphs[props.severity]}
          {props.titleText ? ` ${props.titleText}` : ""}
        </Text>
      </Box>
      <Box>{props.bodyContent}</Box>
    </Box>
  );
}
