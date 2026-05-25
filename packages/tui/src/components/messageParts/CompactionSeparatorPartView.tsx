import type { ReactNode } from "react";
import type { AssistantCompactionSeparatorConversationMessagePart } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export function CompactionSeparatorPartView(props: {
  assistantCompactionSeparatorConversationMessagePart: AssistantCompactionSeparatorConversationMessagePart;
  accentColor: string;
}): ReactNode {
  const titleText = props.assistantCompactionSeparatorConversationMessagePart.source === "auto"
    ? " Auto Compaction "
    : " Compaction ";

  return (
    <box flexDirection="column" flexShrink={0} width="100%">
      <box
        border={["top"]}
        borderColor={props.accentColor}
        flexShrink={0}
        title={titleText}
        titleAlignment="center"
        width="100%"
      />
      <text fg={chatScreenTheme.textDim} width="100%">
        History above remains visible here but is no longer sent to the model.
      </text>
    </box>
  );
}
