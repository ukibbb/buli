import type { ReactNode } from "react";
import type { AssistantLearningSequenceConversationMessagePart } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "../glyphs.ts";

export function AssistantLearningSequencePartView(props: {
  assistantLearningSequenceConversationMessagePart: AssistantLearningSequenceConversationMessagePart;
}): ReactNode {
  const learningSequencePart = props.assistantLearningSequenceConversationMessagePart;
  const sequenceItemCountLabel = learningSequencePart.sequenceItems.length === 1
    ? "1 step"
    : `${learningSequencePart.sequenceItems.length} steps`;

  return (
    <box
      backgroundColor={chatScreenTheme.learningSurfaceBg}
      borderColor={chatScreenTheme.accentCyan}
      borderStyle="rounded"
      flexDirection="column"
      paddingX={1}
      paddingY={1}
      width="100%"
    >
      <box flexDirection="row" justifyContent="space-between" width="100%">
        <box flexShrink={1} minWidth={0}>
          <text fg={chatScreenTheme.textPrimary}>
            <b>{learningSequencePart.titleText}</b>
          </text>
        </box>
        <box flexShrink={0} marginLeft={1}>
          <text fg={chatScreenTheme.textMuted}>{sequenceItemCountLabel}</text>
        </box>
      </box>
      {learningSequencePart.summaryText !== undefined ? (
        <box marginTop={1} width="100%">
          <text fg={chatScreenTheme.textSecondary}>{learningSequencePart.summaryText}</text>
        </box>
      ) : null}
      <box flexDirection="column" marginTop={1} width="100%">
        {learningSequencePart.sequenceItems.map((sequenceItem, sequenceItemIndex) => (
          <box
            flexDirection="column"
            key={`learning-sequence-item-${sequenceItemIndex}`}
            marginTop={sequenceItemIndex === 0 ? 0 : 1}
            width="100%"
          >
            <box flexDirection="row" width="100%">
              <box flexShrink={0} marginRight={1} width={3}>
                <text fg={chatScreenTheme.accentCyan}>{`${sequenceItemIndex + 1}.`.padStart(3, " ")}</text>
              </box>
              <box flexShrink={0} marginRight={1}>
                <text fg={chatScreenTheme.accentPrimaryMuted}>{glyphs.chevronRight}</text>
              </box>
              <box flexShrink={1} minWidth={0}>
                <text fg={chatScreenTheme.textPrimary}>{sequenceItem.labelText}</text>
              </box>
            </box>
            {sequenceItem.detailText !== undefined ? (
              <box paddingLeft={5} width="100%">
                <text fg={chatScreenTheme.textDim}>{sequenceItem.detailText}</text>
              </box>
            ) : null}
          </box>
        ))}
      </box>
    </box>
  );
}
