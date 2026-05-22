import type { ReactNode } from "react";
import { ChatScreen, type ChatScreenProps } from "./ChatScreen.tsx";
import { TerminalSelectionClipboardBridge } from "./clipboard/TerminalSelectionClipboardBridge.tsx";

export function TerminalChatScreenApp(props: ChatScreenProps): ReactNode {
  return (
    <box height="100%" position="relative" width="100%">
      <ChatScreen {...props} />
      <TerminalSelectionClipboardBridge />
    </box>
  );
}
