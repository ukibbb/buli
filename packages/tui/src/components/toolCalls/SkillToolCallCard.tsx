import type { ReactNode } from "react";
import type { ToolCallSkillDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { FileReference } from "../primitives/FileReference.tsx";
import {
  ExpandableToolCallCard,
  formatToolCallDurationMs,
  resolveDefaultToolCallRenderStatePresentation,
} from "./ExpandableToolCallCard.tsx";

export type SkillToolCallCardProps = {
  toolCallDetail: ToolCallSkillDetail;
  renderState: "streaming" | "completed" | "failed";
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
};

export function SkillToolCallCard(props: SkillToolCallCardProps): ReactNode {
  const toolCallPresentation = resolveDefaultToolCallRenderStatePresentation(props.renderState);
  return (
    <ExpandableToolCallCard
      accentColor={toolCallPresentation.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      hasExpandableContent={hasSkillBodyContent(props.toolCallDetail)}
      renderExpandedContent={() => buildSkillBodyContent(props.toolCallDetail)}
      statusKind={toolCallPresentation.statusKind}
      statusLabel={buildSkillStatusLabel(props)}
      toolNameLabel="Skill"
      toolTargetText={props.toolCallDetail.skillName}
    />
  );
}

function buildSkillStatusLabel(props: SkillToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "skill failed";
  }
  if (props.renderState === "streaming") {
    return "loading skill…";
  }

  return props.durationMs === undefined ? "loaded" : `loaded · ${formatToolCallDurationMs(props.durationMs)}`;
}

function hasSkillBodyContent(toolCallDetail: ToolCallSkillDetail): boolean {
  return Boolean(
    toolCallDetail.skillDescription ||
      toolCallDetail.skillSourceKind ||
      toolCallDetail.skillInstructionFilePath,
  );
}

function buildSkillBodyContent(toolCallDetail: ToolCallSkillDetail): ReactNode {
  if (!hasSkillBodyContent(toolCallDetail)) {
    return undefined;
  }

  return (
    <box flexDirection="column" paddingX={1} width="100%">
      {toolCallDetail.skillDescription ? (
        <box width="100%">
          <text fg={chatScreenTheme.textSecondary}>{toolCallDetail.skillDescription}</text>
        </box>
      ) : null}
      {toolCallDetail.skillSourceKind ? (
        <box {...(toolCallDetail.skillDescription ? { marginTop: 1 } : {})} width="100%">
          <text fg={chatScreenTheme.textMuted}>source: {toolCallDetail.skillSourceKind}</text>
        </box>
      ) : null}
      {toolCallDetail.skillInstructionFilePath ? (
        <box width="100%">
          <FileReference filePath={toolCallDetail.skillInstructionFilePath} variant="inline" />
        </box>
      ) : null}
    </box>
  );
}
