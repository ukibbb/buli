import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "../../chatScreenTheme.ts";

// DataTable emulates a bordered table using flexbox rows. A dedicated header
// row gets stronger text + a thin divider beneath it, and each body row
// repeats the same column widths. Column widths default to equal shares of
// fill_container via flexGrow: 1.
export type DataTableProps = {
  columnHeaderLabels: string[];
  bodyRowValues: ReactNode[][];
  columnWidths?: number[];
};

export function DataTable(props: DataTableProps): ReactNode {
  return (
    <Box flexDirection="column" width="100%">
      <DataTableRow
        cellContents={props.columnHeaderLabels.map((columnHeaderLabel) => (
          <Text bold color={chatScreenTheme.textSecondary}>
            {columnHeaderLabel}
          </Text>
        ))}
        {...(props.columnWidths ? { columnWidths: props.columnWidths } : {})}
      />
      <Box backgroundColor={chatScreenTheme.borderSubtle} height={1} width="100%" />
      {props.bodyRowValues.map((bodyRowCells, rowIndex) => (
        <DataTableRow
          cellContents={bodyRowCells}
          key={`table-row-${rowIndex}`}
          {...(props.columnWidths ? { columnWidths: props.columnWidths } : {})}
        />
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
