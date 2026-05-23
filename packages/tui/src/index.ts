import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React from "react";
import type { ChatScreenProps } from "./ChatScreen.tsx";
import { TerminalChatScreenApp } from "./TerminalChatScreenApp.tsx";
import {
  renderChatScreenInTerminalWithRuntime,
  type RenderChatScreenInTerminalInput,
  type TuiChatScreenInstance,
} from "./terminalChatScreenRuntime.ts";

export { ChatScreen } from "./ChatScreen.tsx";
export type {
  ChatScreenProps,
  ConversationSessionCompactionResult,
  ConversationSessionDeleteResult,
  ConversationSessionExportResult,
  ConversationSessionSwitchResult,
} from "./ChatScreen.tsx";
export { ActiveConversationTurnShutdownCoordinator } from "@buli/chat-app-controller";
export {
  renderChatScreenInTerminalWithRuntime,
} from "./terminalChatScreenRuntime.ts";
export type {
  ReactRootForChatScreenRuntime,
  RenderChatScreenInTerminalInput,
  RenderChatScreenInTerminalRuntime,
  TerminalRendererCreateOptionsForChatScreen,
  TerminalRendererForChatScreenRuntime,
  TuiChatScreenInstance,
} from "./terminalChatScreenRuntime.ts";

export async function renderChatScreenInTerminal(input: RenderChatScreenInTerminalInput): Promise<TuiChatScreenInstance> {
  return renderChatScreenInTerminalWithRuntime(input, {
    createTerminalRenderer: createCliRenderer,
    createChatScreenRoot: createRoot,
    createChatScreenElement: (chatScreenProps: ChatScreenProps) => React.createElement(TerminalChatScreenApp, chatScreenProps),
  });
}

export { relayAssistantResponseRunnerEvents } from "./relayAssistantResponseRunnerEvents.ts";
export { ConversationMessageList } from "./components/ConversationMessageList.tsx";
export { CommandHelpModal } from "./components/CommandHelpModal.tsx";
export { ConversationSessionSelectionPane } from "./components/ConversationSessionSelectionPane.tsx";
export { InputPanel } from "./components/InputPanel.tsx";
export { ModelAndReasoningSelectionPane } from "./components/ModelAndReasoningSelectionPane.tsx";
export { PromptContextSelectionPane } from "./components/PromptContextSelectionPane.tsx";
export { PromptDraftText } from "./components/PromptDraftText.tsx";
export { SlashCommandSelectionPane } from "./components/SlashCommandSelectionPane.tsx";
export { ThinkingStatusLine } from "./components/ThinkingStatusLine.tsx";
export { TopBar } from "./components/TopBar.tsx";
export { UserPromptBlock } from "./components/UserPromptBlock.tsx";
export { buildChatSlashCommands } from "@buli/chat-session-state";
