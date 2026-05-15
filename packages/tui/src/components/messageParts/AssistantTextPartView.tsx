import type { ReactNode } from "react";
import type { AssistantTextConversationMessagePart } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { AssistantMarkdownBlock } from "../primitives/AssistantMarkdownBlock.tsx";

export function AssistantTextPartView(props: {
  assistantTextConversationMessagePart: AssistantTextConversationMessagePart;
  horizontalRuleColor: string;
}): ReactNode {
  const markdownText = props.assistantTextConversationMessagePart.rawMarkdownText;
  const hasMarkdownText = markdownText.length > 0;

  return (
    <box flexDirection="column" width="100%">
      {hasMarkdownText ? (
        <AssistantMarkdownBlock
          markdownText={markdownText}
          isStreaming={props.assistantTextConversationMessagePart.partStatus === "streaming"}
          horizontalRuleColor={props.horizontalRuleColor}
        />
      ) : null}
      {!hasMarkdownText ? (
        <text fg={chatScreenTheme.textDim}>Waiting for model output...</text>
      ) : null}
    </box>
  );
}
