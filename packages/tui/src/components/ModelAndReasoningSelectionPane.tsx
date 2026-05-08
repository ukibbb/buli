import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SelectionPaneSelect } from "./SelectionPaneSelect.tsx";

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
      <SelectionPaneSelect
        optionNames={props.visibleChoices}
        highlightedOptionIndex={props.highlightedChoiceIndex}
        maxVisibleOptionCount={Math.max(1, props.visibleChoices.length)}
      />
    </box>
  );
}
