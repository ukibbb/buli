import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

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
    <box flexDirection="column" width="100%">
      <DataTableRow
        cellContents={props.columnHeaderLabels.map((columnHeaderLabel, i) => (
          <text key={i}>
            <b fg={chatScreenTheme.textSecondary}>{columnHeaderLabel}</b>
          </text>
        ))}
        {...(props.columnWidths ? { columnWidths: props.columnWidths } : {})}
      />
      <box backgroundColor={chatScreenTheme.borderSubtle} height={1} width="100%" />
      {props.bodyRowValues.map((bodyRowCells, rowIndex) => (
        <DataTableRow
          cellContents={bodyRowCells}
          key={`table-row-${rowIndex}`}
          {...(props.columnWidths ? { columnWidths: props.columnWidths } : {})}
        />
      ))}
    </box>
  );
}

function DataTableRow(props: { cellContents: ReactNode[]; columnWidths?: number[] }): ReactNode {
  return (
    <box paddingX={1} width="100%">
      {props.cellContents.map((cellContent, columnIndex) => {
        const explicitColumnWidth = props.columnWidths?.[columnIndex];
        return (
          <box
            flexGrow={explicitColumnWidth === undefined ? 1 : 0}
            flexShrink={1}
            key={`table-cell-${columnIndex}`}
            marginRight={columnIndex === props.cellContents.length - 1 ? 0 : 1}
            {...(explicitColumnWidth !== undefined ? { width: explicitColumnWidth } : {})}
          >
            {cellContent}
          </box>
        );
      })}
    </box>
  );
}
