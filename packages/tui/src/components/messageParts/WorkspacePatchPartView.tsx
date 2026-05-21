import type { ReactNode } from "react";
import type { AssistantWorkspacePatchConversationMessagePart } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import {
  formatWorkspacePatchCompactSummary,
  WorkspacePatchChangedFilesView,
} from "../workspacePatch/WorkspacePatchChangedFilesView.tsx";

export function WorkspacePatchPartView(props: {
  assistantWorkspacePatchConversationMessagePart: AssistantWorkspacePatchConversationMessagePart;
}): ReactNode {
  const workspacePatch = props.assistantWorkspacePatchConversationMessagePart.workspacePatch;

  return (
    <SurfaceCard
      accentColor={chatScreenTheme.accentPrimary}
      density="compact"
      headerLeft={(
        <box flexDirection="row" gap={1} width="100%">
          <text fg={chatScreenTheme.accentPrimary}>workspace patch</text>
          <text fg={chatScreenTheme.textSecondary}>{formatWorkspacePatchCompactSummary(workspacePatch)}</text>
        </box>
      )}
      bodyContent={<WorkspacePatchChangedFilesView workspacePatch={workspacePatch} />}
    />
  );
}
