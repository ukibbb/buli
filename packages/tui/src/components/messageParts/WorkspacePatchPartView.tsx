import type { ReactNode } from "react";
import type { AssistantWorkspacePatchConversationMessagePart } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { DiffBlock } from "../primitives/DiffBlock.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";

const MAX_VISIBLE_WORKSPACE_PATCH_DIFF_LINES = 120;

export function WorkspacePatchPartView(props: {
  assistantWorkspacePatchConversationMessagePart: AssistantWorkspacePatchConversationMessagePart;
}): ReactNode {
  const workspacePatch = props.assistantWorkspacePatchConversationMessagePart.workspacePatch;
  const visibleUnifiedDiffText = workspacePatch.changedFiles
    .map((changedFile) => changedFile.unifiedDiffText)
    .filter((unifiedDiffText): unifiedDiffText is string => unifiedDiffText !== undefined && unifiedDiffText.length > 0)
    .join("\n");

  return (
    <SurfaceCard
      accentColor={chatScreenTheme.accentPrimary}
      headerLeft={(
        <box gap={1} width="100%">
          <text fg={chatScreenTheme.accentPrimary}>workspace patch</text>
          <text fg={chatScreenTheme.textSecondary}>{`${workspacePatch.changedFileCount} files`}</text>
          <text fg={chatScreenTheme.accentGreen}>{`+${workspacePatch.addedLineCount}`}</text>
          <text fg={chatScreenTheme.accentRed}>{`-${workspacePatch.removedLineCount}`}</text>
        </box>
      )}
      bodyContent={(
        <box flexDirection="column" gap={1} width="100%">
          <box flexDirection="column" gap={0} width="100%">
            {workspacePatch.changedFiles.map((changedFile) => (
              <text fg={chatScreenTheme.textMuted} key={changedFile.filePath}>
                {`${formatWorkspacePatchChangeKind(changedFile.changeKind)} ${changedFile.filePath} (+${changedFile.addedLineCount} -${changedFile.removedLineCount})`}
              </text>
            ))}
          </box>
          {visibleUnifiedDiffText.length > 0 ? (
            <DiffBlock
              maximumVisibleLineCount={MAX_VISIBLE_WORKSPACE_PATCH_DIFF_LINES}
              unifiedDiffText={visibleUnifiedDiffText}
            />
          ) : null}
        </box>
      )}
    />
  );
}

function formatWorkspacePatchChangeKind(changeKind: string): string {
  return changeKind === "added" ? "A" : changeKind === "deleted" ? "D" : "M";
}
