import { Box, Text } from "ink";
import { chatScreenTheme } from "../chatScreenTheme.ts";

export type ModelAndReasoningSelectionPaneProps = {
  headingText: string;
  visibleChoices: string[];
  highlightedChoiceIndex: number;
};

export function ModelAndReasoningSelectionPane(props: ModelAndReasoningSelectionPaneProps) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color={chatScreenTheme.accentCyan}>
        {props.headingText}
      </Text>
      {props.visibleChoices.map((visibleChoice, index) => {
        const selectionMarker = index === props.highlightedChoiceIndex ? ">" : " ";
        return (
          <Text color={index === props.highlightedChoiceIndex ? chatScreenTheme.accentCyan : chatScreenTheme.textPrimary} key={`${visibleChoice}-${index}`}>
            {`${selectionMarker} ${visibleChoice}`}
          </Text>
        );
      })}
      <Text color={chatScreenTheme.textMuted}>Enter select | Esc close | Up/Down move</Text>
    </Box>
  );
}
