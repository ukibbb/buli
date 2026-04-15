import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "../../chatScreenTheme.ts";

// KeyValueList aligns keys on the left in a fixed column and lets values take
// the remaining width. The caller supplies the column width because the
// design tends to use 10–18 cells depending on the longest key.
export type KeyValueEntry = {
  entryKeyLabel: string;
  entryValueContent: ReactNode;
};

export type KeyValueListProps = {
  keyColumnWidth?: number;
  entries: KeyValueEntry[];
};

export function KeyValueList(props: KeyValueListProps): ReactNode {
  const keyColumnWidth =
    props.keyColumnWidth ??
    Math.min(
      Math.max(
        ...props.entries.map((keyValueEntry) => keyValueEntry.entryKeyLabel.length),
        4,
      ),
      24,
    );
  return (
    <Box flexDirection="column" width="100%">
      {props.entries.map((keyValueEntry, index) => (
        <Box key={`kv-entry-${index}`} width="100%">
          <Box flexShrink={0} width={keyColumnWidth}>
            <Text color={chatScreenTheme.textMuted}>{keyValueEntry.entryKeyLabel}</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} marginLeft={1}>
            {keyValueEntry.entryValueContent}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
