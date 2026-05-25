import type { ReactNode } from "react";
import type { AssistantCompactionSeparatorConversationMessagePart } from "@buli/contracts";

export function CompactionSeparatorPartView(props: {
  assistantCompactionSeparatorConversationMessagePart: AssistantCompactionSeparatorConversationMessagePart;
  accentColor: string;
}): ReactNode {
  const titleText = props.assistantCompactionSeparatorConversationMessagePart.source === "auto"
    ? " Auto Compaction "
    : " Compaction ";

  return (
    <box
      border={["top"]}
      borderColor={props.accentColor}
      flexShrink={0}
      title={titleText}
      titleAlignment="center"
      width="100%"
    />
  );
}
