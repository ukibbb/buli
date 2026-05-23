import { memo, type ReactNode } from "react";
import { LiveInteractionStatusStack, type LiveInteractionStatusStackProps } from "./LiveInteractionStatusStack.tsx";
import { PromptComposerChrome, type PromptComposerChromeProps } from "./PromptComposerChrome.tsx";

export type LiveInteractionChromeProps = {
  statusStackProps: LiveInteractionStatusStackProps;
  promptComposerProps: PromptComposerChromeProps;
};

function LiveInteractionChromeComponent(props: LiveInteractionChromeProps): ReactNode {
  return (
    <box flexDirection="column" flexShrink={0}>
      <LiveInteractionStatusStack {...props.statusStackProps} />
      <PromptComposerChrome {...props.promptComposerProps} />
    </box>
  );
}

export const LiveInteractionChrome = memo(LiveInteractionChromeComponent);
