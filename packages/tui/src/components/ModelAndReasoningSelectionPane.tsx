import type { ReactNode } from "react";
import { SelectionPaneFrame } from "./SelectionPaneFrame.tsx";
import { SelectionPaneSelect } from "./SelectionPaneSelect.tsx";

export type ModelAndReasoningSelectionPaneProps = {
  headingText: string;
  visibleChoices: string[];
  highlightedChoiceIndex: number;
  accentColor: string;
};

export function ModelAndReasoningSelectionPane(
  props: ModelAndReasoningSelectionPaneProps,
): ReactNode {
  return (
    <SelectionPaneFrame headingText={props.headingText} accentColor={props.accentColor}>
      <SelectionPaneSelect
        optionNames={props.visibleChoices}
        highlightedOptionIndex={props.highlightedChoiceIndex}
        maxVisibleOptionCount={Math.max(1, props.visibleChoices.length)}
      />
    </SelectionPaneFrame>
  );
}
