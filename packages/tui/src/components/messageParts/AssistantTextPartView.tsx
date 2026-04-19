import type { ReactNode } from "react";
import type { AssistantTextConversationMessagePart, ConversationOpenAssistantTextPart } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { RenderAssistantResponseTree } from "../../richText/renderAssistantResponseTree.tsx";
import { FencedCodeBlock } from "../primitives/FencedCodeBlock.tsx";

function OpenAssistantTextPartTail(props: { openContentPart: ConversationOpenAssistantTextPart }): ReactNode {
  if (props.openContentPart.kind === "streaming_fenced_code_block") {
    return (
      <FencedCodeBlock
        {...(props.openContentPart.languageLabel ? { languageLabel: props.openContentPart.languageLabel } : {})}
        codeLines={props.openContentPart.codeLines.map((codeLineText) => ({ lineText: codeLineText }))}
      />
    );
  }

  return <text fg={chatScreenTheme.textPrimary}>{props.openContentPart.text}</text>;
}

export function AssistantTextPartView(props: {
  assistantTextConversationMessagePart: AssistantTextConversationMessagePart;
}): ReactNode {
  const hasCompletedContentParts = props.assistantTextConversationMessagePart.completedContentParts.length > 0;
  const hasOpenContentPart = props.assistantTextConversationMessagePart.openContentPart !== undefined;

  return (
    <box flexDirection="column" width="100%">
      {hasCompletedContentParts ? (
        <RenderAssistantResponseTree
          assistantContentParts={props.assistantTextConversationMessagePart.completedContentParts}
        />
      ) : null}
      {hasOpenContentPart ? (
        <box marginTop={hasCompletedContentParts ? 1 : 0} width="100%">
          <OpenAssistantTextPartTail openContentPart={props.assistantTextConversationMessagePart.openContentPart!} />
        </box>
      ) : null}
      {!hasCompletedContentParts && !hasOpenContentPart ? (
        <text fg={chatScreenTheme.textDim}>Waiting for model output...</text>
      ) : null}
    </box>
  );
}
