import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// A bulleted list renders one row per item, each prefixed with a ">_" glyph
// in bold accentCyan to draw the eye to the list structure while keeping the
// item content clear. Design: pen frame lNP2q (ch04 ulBlock).
export type BulletedListProps = {
  itemContents: ReactNode[];
};

export function BulletedList(props: BulletedListProps): ReactNode {
  return (
    <Box flexDirection="column" width="100%">
      {props.itemContents.map((itemContent, index) => (
        <Box key={`bulleted-item-${index}`} width="100%">
          <Box flexShrink={0} marginRight={1}>
            <Text bold color={chatScreenTheme.accentCyan}>{">_"}</Text>
          </Box>
          <Box flexShrink={1}>{itemContent}</Box>
        </Box>
      ))}
    </Box>
  );
}
