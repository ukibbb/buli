import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type ModelAndReasoningSelectionPaneProps = {
  headingText: string;
  visibleChoices: string[];
  highlightedChoiceIndex: number;
};

export function ModelAndReasoningSelectionPane(
  props: ModelAndReasoningSelectionPaneProps,
): ReactNode {
  return (
    <box
      borderStyle="rounded"
      borderColor={chatScreenTheme.border}
      backgroundColor={chatScreenTheme.surfaceOne}
      flexDirection="column"
      flexShrink={0}
      marginX={2}
      marginBottom={1}
      paddingX={1}
    >
      <text fg={chatScreenTheme.textMuted}>{props.headingText}</text>
      {props.visibleChoices.map((visibleChoice, index) => {
        const isHighlightedChoice = index === props.highlightedChoiceIndex;
        return (
          <box
            key={`${visibleChoice}-${index}`}
            flexDirection="row"
            gap={1}
            width="100%"
          >
            <text fg={isHighlightedChoice ? chatScreenTheme.accentGreen : chatScreenTheme.textDim}>
              {isHighlightedChoice ? ">" : " "}
            </text>
            <box flexShrink={1} minWidth={0} overflow="hidden">
              <text
                fg={isHighlightedChoice ? chatScreenTheme.textPrimary : chatScreenTheme.textSecondary}
                truncate={true}
                wrapMode="none"
              >
                {visibleChoice}
              </text>
            </box>
          </box>
        );
      })}
    </box>
  );
}
