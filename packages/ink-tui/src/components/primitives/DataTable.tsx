import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// Pen frame jd7i3 (ch05 tblBlock): rounded accentGreen 1-cell border,
// surfaceTwo header strip, borderSubtle 1-cell dividers between every row.
export type DataTableProps = {
  columnHeaderLabels: string[];
  bodyRowValues: ReactNode[][];
  columnWidths?: number[];
};

export function DataTable(props: DataTableProps): ReactNode {
  return (
    <Box
      borderStyle="round"
      borderColor={chatScreenTheme.accentGreen}
      flexDirection="column"
      width="100%"
    >
      <Box backgroundColor={chatScreenTheme.surfaceTwo} width="100%">
        <DataTableRow
          cellContents={props.columnHeaderLabels.map((columnHeaderLabel) => (
            <Text bold color={chatScreenTheme.textSecondary}>
              {columnHeaderLabel}
            </Text>
          ))}
          {...(props.columnWidths ? { columnWidths: props.columnWidths } : {})}
        />
      </Box>
      <Box backgroundColor={chatScreenTheme.borderSubtle} height={1} width="100%" />
      {props.bodyRowValues.map((bodyRowCells, rowIndex) => (
        <Box flexDirection="column" key={`table-row-wrap-${rowIndex}`} width="100%">
          <DataTableRow
            cellContents={bodyRowCells}
            {...(props.columnWidths ? { columnWidths: props.columnWidths } : {})}
          />
          {rowIndex < props.bodyRowValues.length - 1 ? (
            <Box backgroundColor={chatScreenTheme.borderSubtle} height={1} width="100%" />
          ) : null}
        </Box>
      ))}
    </Box>
  );
}

function DataTableRow(props: { cellContents: ReactNode[]; columnWidths?: number[] }): ReactNode {
  return (
    <Box paddingX={1} width="100%">
      {props.cellContents.map((cellContent, columnIndex) => {
        const explicitColumnWidth = props.columnWidths?.[columnIndex];
        return (
          <Box
            flexBasis={0}
            flexGrow={explicitColumnWidth === undefined ? 1 : 0}
            flexShrink={1}
            key={`table-cell-${columnIndex}`}
            marginRight={columnIndex === props.cellContents.length - 1 ? 0 : 1}
            width={explicitColumnWidth}
          >
            {cellContent}
          </Box>
        );
      })}
    </Box>
  );
}
