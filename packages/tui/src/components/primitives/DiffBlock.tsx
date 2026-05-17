import type { ReactNode } from "react";
import type { UnifiedDiffText } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type DiffBlockProps = {
  unifiedDiffText: UnifiedDiffText;
  maximumVisibleLineCount?: number;
};

type VisibleUnifiedDiffText = {
  visibleRowCount: number;
  totalRowCount: number;
  hiddenRowCount: number;
};

function splitUnifiedDiffTextIntoRows(unifiedDiffText: UnifiedDiffText): string[] {
  return unifiedDiffText.replace(/\n$/, "").split("\n");
}

function countUnifiedDiffRenderableRows(unifiedDiffLines: readonly string[]): number {
  let isInsideHunk = false;
  let renderableRowCount = 0;

  for (const unifiedDiffLine of unifiedDiffLines) {
    if (unifiedDiffLine.startsWith("diff --git ")) {
      isInsideHunk = false;
      continue;
    }
    if (unifiedDiffLine.startsWith("@@")) {
      isInsideHunk = true;
      continue;
    }
    if (!isInsideHunk || unifiedDiffLine.startsWith("\\ No newline")) {
      continue;
    }
    renderableRowCount += 1;
  }

  return renderableRowCount;
}

function buildVisibleUnifiedDiffText(props: DiffBlockProps): VisibleUnifiedDiffText {
  const unifiedDiffLines = splitUnifiedDiffTextIntoRows(props.unifiedDiffText);
  const totalRenderableRowCount = countUnifiedDiffRenderableRows(unifiedDiffLines) || unifiedDiffLines.length;
  const maximumVisibleLineCount = props.maximumVisibleLineCount === undefined
    ? totalRenderableRowCount
    : Math.max(1, Math.floor(props.maximumVisibleLineCount));
  const visibleRowCount = Math.min(maximumVisibleLineCount, totalRenderableRowCount);

  return {
    visibleRowCount,
    totalRowCount: totalRenderableRowCount,
    hiddenRowCount: totalRenderableRowCount - visibleRowCount,
  };
}

export function DiffBlock(props: DiffBlockProps): ReactNode {
  const visibleUnifiedDiffText = buildVisibleUnifiedDiffText(props);
  return (
    <box flexDirection="column" width="100%">
      <diff
        addedBg={chatScreenTheme.diffAdditionBg}
        addedLineNumberBg={chatScreenTheme.diffAdditionBg}
        addedSignColor={chatScreenTheme.accentGreen}
        contextBg={chatScreenTheme.bg}
        diff={props.unifiedDiffText}
        fg={chatScreenTheme.textSecondary}
        height={visibleUnifiedDiffText.visibleRowCount}
        lineNumberFg={chatScreenTheme.textDim}
        removedBg={chatScreenTheme.diffRemovalBg}
        removedLineNumberBg={chatScreenTheme.diffRemovalBg}
        removedSignColor={chatScreenTheme.accentRed}
        selectionBg={chatScreenTheme.accentPrimary}
        selectionFg={chatScreenTheme.textPrimary}
        showLineNumbers={true}
        view="unified"
        width="100%"
        wrapMode="none"
      />
      {visibleUnifiedDiffText.hiddenRowCount > 0 ? (
        <box paddingX={1} width="100%">
          <text fg={chatScreenTheme.textMuted}>
            {`... showing first ${visibleUnifiedDiffText.visibleRowCount} of ${visibleUnifiedDiffText.totalRowCount} diff rows`}
          </text>
        </box>
      ) : null}
    </box>
  );
}
