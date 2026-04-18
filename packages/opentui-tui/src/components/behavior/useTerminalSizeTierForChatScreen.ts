import { useTerminalDimensions } from "@opentui/react";
import {
  classifyTerminalSizeTierForChatScreen,
  type TerminalSizeTierForChatScreen,
} from "@buli/assistant-design-tokens";

// Hook adapter that maps OpenTUI's useTerminalDimensions() into the shared
// TerminalSizeTierForChatScreen so every responsive branch in the chat screen
// (layout pinning, modal trimming, prompt-strip collapse) reads from one
// named decision instead of comparing width/height inline.
export function useTerminalSizeTierForChatScreen(): TerminalSizeTierForChatScreen {
  const { width, height } = useTerminalDimensions();
  return classifyTerminalSizeTierForChatScreen({
    rowCount: height,
    columnCount: width,
  });
}
