import { chatScreenTheme } from "@buli/assistant-design-tokens";
import type { ReactNode } from "react";
import { ChatScreenMainArea, type ChatScreenMainAreaProps } from "./ChatScreenMainArea.tsx";
import { LiveInteractionChrome, type LiveInteractionChromeProps } from "./LiveInteractionChrome.tsx";
import { TopBar } from "./TopBar.tsx";

export type ChatScreenLayoutProps = {
  terminalRowCount: number;
  terminalColumnCount: number;
  workingDirectoryPath: string;
  mainAreaProps: ChatScreenMainAreaProps;
  liveInteractionChromeProps: LiveInteractionChromeProps;
};

export function ChatScreenLayout(props: ChatScreenLayoutProps): ReactNode {
  return (
    <box backgroundColor={chatScreenTheme.bg} flexDirection="column" height={props.terminalRowCount} width={props.terminalColumnCount}>
      <TopBar
        workingDirectoryPath={props.workingDirectoryPath}
        accentColor={props.liveInteractionChromeProps.promptComposerProps.inputPanelAccentColor}
      />
      {/* Keep one breathing row between transcript output and the prompt frame so
          live tool-call cards do not visually merge with the input. */}
      <box flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden" paddingX={2} paddingTop={1} paddingBottom={1}>
        <ChatScreenMainArea {...props.mainAreaProps} />
      </box>
      <LiveInteractionChrome {...props.liveInteractionChromeProps} />
    </box>
  );
}
