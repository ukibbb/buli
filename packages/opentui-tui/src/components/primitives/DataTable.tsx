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
    <box
      borderStyle="rounded"
      borderColor={chatScreenTheme.accentGreen}
      flexDirection="column"
      width="100%"
    >
      <box backgroundColor={chatScreenTheme.surfaceTwo} width="100%">
        <DataTableRow
          cellContents={props.columnHeaderLabels.map((columnHeaderLabel, i) => (
            <text key={i}>
              <b fg={chatScreenTheme.textSecondary}>{columnHeaderLabel}</b>
            </text>
          ))}
          {...(props.columnWidths ? { columnWidths: props.columnWidths } : {})}
        />
      </box>
      <box backgroundColor={chatScreenTheme.borderSubtle} height={1} width="100%" />
      {props.bodyRowValues.map((bodyRowCells, rowIndex) => (
        <box flexDirection="column" key={`table-row-wrap-${rowIndex}`} width="100%">
          <DataTableRow
            cellContents={bodyRowCells}
            {...(props.columnWidths ? { columnWidths: props.columnWidths } : {})}
          />
          {rowIndex < props.bodyRowValues.length - 1 ? (
            <box backgroundColor={chatScreenTheme.borderSubtle} height={1} width="100%" />
          ) : null}
        </box>
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
