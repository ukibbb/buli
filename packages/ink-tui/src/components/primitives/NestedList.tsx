import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// A nested list renders a recursive tree. Each child level indents via the
// parent's padding-left, so arbitrary depth is supported without explicit
// per-level logic. The bullet colour cycles lightly through accent tokens so
// nested depth is visually distinguishable.
export type NestedListItem = {
  itemContent: ReactNode;
  childItems?: NestedListItem[];
};

export type NestedListProps = {
  items: NestedListItem[];
  depth?: number;
};

const depthAccentColors = [
  chatScreenTheme.accentPrimaryMuted,
  chatScreenTheme.accentCyan,
  chatScreenTheme.accentAmber,
];

export function NestedList(props: NestedListProps): ReactNode {
  const depth = props.depth ?? 0;
  const bulletColor = depthAccentColors[depth % depthAccentColors.length] ?? chatScreenTheme.textMuted;
  return (
    <Box flexDirection="column" width="100%">
      {props.items.map((nestedListItem, index) => (
        <Box flexDirection="column" key={`nested-item-${depth}-${index}`} width="100%">
          <Box width="100%">
            <Box flexShrink={0} marginRight={1}>
              <Text color={bulletColor}>{depth === 0 ? "·" : "∘"}</Text>
            </Box>
            <Box flexShrink={1}>{nestedListItem.itemContent}</Box>
          </Box>
          {nestedListItem.childItems && nestedListItem.childItems.length > 0 ? (
            <Box paddingLeft={2} width="100%">
              <NestedList depth={depth + 1} items={nestedListItem.childItems} />
            </Box>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}
