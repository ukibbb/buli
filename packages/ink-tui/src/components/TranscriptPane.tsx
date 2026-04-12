import { Box, Text } from "ink";
import type { TranscriptEntry } from "../state.ts";

export type TranscriptPaneProps = {
  entries: TranscriptEntry[];
};

export function TranscriptPane(props: TranscriptPaneProps) {
  if (props.entries.length === 0) {
    return <Text dimColor>No messages yet.</Text>;
  }

  return (
    <Box flexDirection="column">
      {props.entries.map((entry, index) => {
        if (entry.kind === "error") {
          return (
            <Text color="red" key={`error-${index}`}>
              Error: {entry.text}
            </Text>
          );
        }

        const prefix = entry.message.role === "user" ? "You" : "Assistant";
        return (
          <Text key={entry.message.id}>
            {prefix}: {entry.message.text}
          </Text>
        );
      })}
    </Box>
  );
}
