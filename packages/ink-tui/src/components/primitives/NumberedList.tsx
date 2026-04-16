import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// A numbered list aligns its gutter so all items line up even when the
// largest index is two or three digits. The gutter width is computed from the
// number of items so two-digit lists keep their indent consistent.
export type NumberedListProps = {
  itemContents: ReactNode[];
  startingIndex?: number;
};

export function NumberedList(props: NumberedListProps): ReactNode {
  const startingIndex = props.startingIndex ?? 1;
  const highestDisplayedIndex = startingIndex + props.itemContents.length - 1;
  const gutterWidth = String(highestDisplayedIndex).length + 1;
  return (
    <Box flexDirection="column" width="100%">
      {props.itemContents.map((itemContent, index) => (
        <Box key={`numbered-item-${index}`} width="100%">
          <Box flexShrink={0} marginRight={1} width={gutterWidth}>
            <Text color={chatScreenTheme.accentPrimaryMuted}>
              {`${startingIndex + index}.`.padStart(gutterWidth, " ")}
            </Text>
          </Box>
          <Box flexShrink={1}>{itemContent}</Box>
        </Box>
      ))}
    </Box>
  );
}
