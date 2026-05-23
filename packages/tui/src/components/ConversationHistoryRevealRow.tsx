import { useState, type ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { createClickableControlMouseDownHandler } from "./primitives/clickableControl.ts";

export type ConversationHistoryRevealRowProps = {
  hiddenOlderConversationMessageCount: number;
  olderConversationMessageRevealCount: number;
  onRevealOlderConversationMessages: () => void;
};

export function ConversationHistoryRevealRow(props: ConversationHistoryRevealRowProps): ReactNode {
  const [isPointerHovering, setIsPointerHovering] = useState(false);
  if (props.hiddenOlderConversationMessageCount <= 0 || props.olderConversationMessageRevealCount <= 0) {
    return null;
  }

  const accentColor = chatScreenTheme.accentPurple;
  const actionColor = isPointerHovering ? chatScreenTheme.textPrimary : accentColor;
  const detailColor = isPointerHovering ? chatScreenTheme.textSecondary : chatScreenTheme.textDim;

  return (
    <box
      {...(isPointerHovering ? { backgroundColor: chatScreenTheme.surfaceOne } : {})}
      border={["bottom"]}
      borderColor={accentColor}
      flexDirection="row"
      onMouseDown={createClickableControlMouseDownHandler(props.onRevealOlderConversationMessages)}
      onMouseOut={() => setIsPointerHovering(false)}
      onMouseOver={() => setIsPointerHovering(true)}
      paddingX={1}
      width="100%"
    >
      <text selectable={false} truncate={true} wrapMode="none" width="100%">
        <span fg={actionColor}><b>↑ Show older messages</b></span>
        <span fg={detailColor}>
          {` · ${props.olderConversationMessageRevealCount} older · ${props.hiddenOlderConversationMessageCount} hidden`}
        </span>
      </text>
    </box>
  );
}
