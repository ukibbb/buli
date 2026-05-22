import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { useTerminalDimensions } from "@opentui/react";
import { glyphs } from "./glyphs.ts";

export type ClipboardCopyToastProps = {
  isVisible: boolean;
};

const CLIPBOARD_COPY_TOAST_MAX_WIDTH_IN_CELLS = 32;

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

export function ClipboardCopyToast(props: ClipboardCopyToastProps): ReactNode {
  const { width: terminalColumnCount } = useTerminalDimensions();
  const toastMaxWidth = Math.max(
    1,
    Math.min(CLIPBOARD_COPY_TOAST_MAX_WIDTH_IN_CELLS, terminalColumnCount - 4),
  );

  if (!props.isVisible) {
    return null;
  }

  return (
    <box
      position="absolute"
      top={1}
      right={2}
      zIndex={1000}
      maxWidth={toastMaxWidth}
      borderColor={chatScreenTheme.accentGreen}
      border={["left"]}
      customBorderChars={leftRailBorderChars}
      backgroundColor={chatScreenTheme.surfaceOne}
      paddingX={2}
      paddingY={1}
    >
      <box flexDirection="row" gap={1} minWidth={0} overflow="hidden">
        <text fg={chatScreenTheme.accentGreen}>{glyphs.checkMark}</text>
        <text fg={chatScreenTheme.textPrimary} truncate={true} wrapMode="none">
          {"Copied to clipboard"}
        </text>
      </box>
    </box>
  );
}
