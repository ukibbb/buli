import { useWindowSize } from "ink";
import {
  classifyTerminalSizeTierForChatScreen,
  type TerminalSizeTierForChatScreen,
} from "@buli/assistant-design-tokens";

// Hook adapter that maps Ink's useWindowSize() into the shared
// TerminalSizeTierForChatScreen so every responsive branch in the chat screen
// (layout pinning, modal trimming, prompt-strip collapse) reads from one
// named decision instead of comparing rows/columns inline.
export function useTerminalSizeTierForChatScreen(): TerminalSizeTierForChatScreen {
  const { rows, columns } = useWindowSize();
  return classifyTerminalSizeTierForChatScreen({
    rowCount: rows,
    columnCount: columns,
  });
}
