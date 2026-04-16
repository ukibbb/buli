import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// Renders the model / reasoning-effort selection pane. Arrow-key navigation
// and selection are handled by the parent; this component is pure display.
export type ModelAndReasoningSelectionPaneProps = {
  headingText: string;
  visibleChoices: string[];
  highlightedChoiceIndex: number;
};

export function ModelAndReasoningSelectionPane(
  props: ModelAndReasoningSelectionPaneProps,
): ReactNode {
  return (
    <box flexDirection="column" gap={1}>
      <text fg={chatScreenTheme.accentCyan}>
        <b>{props.headingText}</b>
      </text>
      {props.visibleChoices.map((visibleChoice, index) => {
        const selectionMarker = index === props.highlightedChoiceIndex ? ">" : " ";
        return (
          <text
            fg={
              index === props.highlightedChoiceIndex
                ? chatScreenTheme.accentCyan
                : chatScreenTheme.textPrimary
            }
            key={`${visibleChoice}-${index}`}
          >
            {`${selectionMarker} ${visibleChoice}`}
          </text>
        );
      })}
      <text fg={chatScreenTheme.textMuted}>{"Enter select | Esc close | Up/Down move"}</text>
    </box>
  );
}
