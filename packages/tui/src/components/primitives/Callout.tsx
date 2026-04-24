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

const leftRailBorderChars = {
  topLeft: "",
  bottomLeft: "",
  vertical: "┃",
  topRight: "",
  bottomRight: "",
  horizontal: " ",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
} as const;

export function Callout(props: CalloutProps): ReactNode {
  const accentColor = severityAccentColors[props.severity];
  const backgroundColor = severityBackgroundColors[props.severity];
  return (
    <box
      borderColor={accentColor}
      border={["left"]}
      customBorderChars={leftRailBorderChars}
      flexDirection="column"
      width="100%"
    >
      <box backgroundColor={backgroundColor} flexDirection="column" paddingX={2} paddingY={1} width="100%">
        <box width="100%">
          <text fg={accentColor}>
            {severityGlyphs[props.severity]}
            {props.titleText ? ` ${props.titleText}` : ""}
          </text>
        </box>
        <box width="100%">{props.bodyContent}</box>
      </box>
    </box>
  );
}
