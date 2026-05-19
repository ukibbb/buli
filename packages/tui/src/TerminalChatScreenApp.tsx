import type { ReactNode } from "react";
import { ChatScreen, type ChatScreenProps } from "./ChatScreen.tsx";
import { TerminalSelectionClipboardBridge } from "./clipboard/TerminalSelectionClipboardBridge.tsx";

export function TerminalChatScreenApp(props: ChatScreenProps): ReactNode {
  return (
    <>
      <TerminalSelectionClipboardBridge />
      <ChatScreen {...props} />
    </>
  );
}
