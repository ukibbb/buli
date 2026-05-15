import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type ToolCallResultDisclosureControlProps = {
  resultSummaryText: string;
  isResultExpanded: boolean;
  onResultExpansionToggle: () => void;
};

export function ToolCallResultDisclosureControl(props: ToolCallResultDisclosureControlProps): ReactNode {
  const disclosureText = props.isResultExpanded ? "[-]" : "[+]";
  const actionHintText = props.isResultExpanded ? "click to hide content" : "click to show content";
  return (
    <box
      flexDirection="row"
      onMouseDown={() => props.onResultExpansionToggle()}
      width="100%"
    >
      <text wrapMode="none" width="100%">
        <span fg={chatScreenTheme.accentCyan}>{disclosureText}</span>
        <span fg={chatScreenTheme.textSecondary}>{` ${props.resultSummaryText}`}</span>
        <span fg={chatScreenTheme.textDim}>{` - ${actionHintText}`}</span>
      </text>
    </box>
  );
}
