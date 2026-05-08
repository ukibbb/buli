import type { ReactNode } from "react";
import type { UnifiedDiffText } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type DiffBlockProps = {
  unifiedDiffText: UnifiedDiffText;
};

function countUnifiedDiffTextRows(unifiedDiffText: UnifiedDiffText): number {
  return unifiedDiffText.replace(/\n$/, "").split("\n").length;
}

export function DiffBlock(props: DiffBlockProps): ReactNode {
  return (
    <diff
      addedBg={chatScreenTheme.diffAdditionBg}
      addedLineNumberBg={chatScreenTheme.diffAdditionBg}
      addedSignColor={chatScreenTheme.accentGreen}
      contextBg={chatScreenTheme.bg}
      diff={props.unifiedDiffText}
      fg={chatScreenTheme.textSecondary}
      height={countUnifiedDiffTextRows(props.unifiedDiffText)}
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
  );
}
