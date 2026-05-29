import type { ReactNode } from "react";
import type { ToolCallDetail, WorkspacePatch } from "@buli/contracts";
import { ApprovalDecisionControl } from "../primitives/ApprovalDecisionControl.tsx";
import { BashToolCallCard } from "./BashToolCallCard.tsx";
import { EditManyToolCallCard } from "./EditManyToolCallCard.tsx";
import { EditToolCallCard } from "./EditToolCallCard.tsx";
import { GlobToolCallCard } from "./GlobToolCallCard.tsx";
import { GrepToolCallCard } from "./GrepToolCallCard.tsx";
import { LocateCodebaseSymbolsToolCallCard } from "./LocateCodebaseSymbolsToolCallCard.tsx";
import { PatchToolCallCard } from "./PatchToolCallCard.tsx";
import { ReadToolCallCard } from "./ReadToolCallCard.tsx";
import { SkillToolCallCard } from "./SkillToolCallCard.tsx";
import { TaskToolCallCard } from "./TaskToolCallCard.tsx";
import { TodoWriteToolCallCard } from "./TodoWriteToolCallCard.tsx";
import { WorkflowHandoffToolCallCard } from "./WorkflowHandoffToolCallCard.tsx";
import { WriteToolCallCard } from "./WriteToolCallCard.tsx";

// ToolCallEntryView dispatches an assistant tool-call part's ToolCallDetail to
// the correct per-tool card. All cards accept the same renderState /
// durationMs / errorText shape, so the dispatcher stays tiny and exhaustively
// typed over ToolCallDetail's discriminated union.
export type ToolCallEntryViewProps = {
  toolCallDetail: ToolCallDetail;
  renderState: "streaming" | "completed" | "failed";
  pendingToolCallApprovalDecisionActions?: PendingToolCallApprovalDecisionActions;
  durationMs?: number;
  toolCallStartedAtMs?: number;
  errorText?: string;
  workspacePatch?: WorkspacePatch;
};

export type PendingToolCallApprovalDecisionActions = {
  onApprove: () => void;
  onDeny: () => void;
};

type ToolCallDetailName = ToolCallDetail["toolName"];
type ToolCallDetailByName<ToolName extends ToolCallDetailName> = Extract<ToolCallDetail, { toolName: ToolName }>;

type ToolCallCardSharedInput = {
  renderState: ToolCallEntryViewProps["renderState"];
  approvalDecisionControl: ReactNode | undefined;
  durationMs?: number | undefined;
  errorText?: string | undefined;
};

type ToolCallCardSharedProps = {
  renderState: ToolCallEntryViewProps["renderState"];
  approvalDecisionControl?: ReactNode;
  durationMs?: number;
  errorText?: string;
};

type ToolCallCardWorkspacePatchInput = ToolCallCardSharedInput & {
  workspacePatch?: WorkspacePatch | undefined;
};

type ToolCallCardWorkspacePatchProps = ToolCallCardSharedProps & {
  workspacePatch?: WorkspacePatch;
};

type ToolCallEntryRendererProps<ToolName extends ToolCallDetailName> = Omit<ToolCallEntryViewProps, "toolCallDetail"> & {
  toolCallDetail: ToolCallDetailByName<ToolName>;
  approvalDecisionControl: ReactNode | undefined;
};

type ToolCallEntryRenderer<ToolName extends ToolCallDetailName> = (
  props: ToolCallEntryRendererProps<ToolName>,
) => ReactNode;

const toolCallEntryRendererByName: {
  readonly [ToolName in ToolCallDetailName]: ToolCallEntryRenderer<ToolName>;
} = {
  read: renderReadToolCallEntry,
  grep: renderGrepToolCallEntry,
  glob: renderGlobToolCallEntry,
  locate_codebase_symbols: renderLocateCodebaseSymbolsToolCallEntry,
  edit: renderEditToolCallEntry,
  edit_many: renderEditManyToolCallEntry,
  patch: renderPatchToolCallEntry,
  patch_many: renderPatchToolCallEntry,
  write: renderWriteToolCallEntry,
  bash: renderBashToolCallEntry,
  todowrite: renderTodoWriteToolCallEntry,
  task: renderTaskToolCallEntry,
  skill: renderSkillToolCallEntry,
  record_workflow_handoff: renderWorkflowHandoffToolCallEntry,
};

export function ToolCallEntryView(props: ToolCallEntryViewProps): ReactNode {
  const { toolCallDetail } = props;
  const approvalDecisionControl = props.pendingToolCallApprovalDecisionActions ? (
    <ApprovalDecisionControl
      onApprove={props.pendingToolCallApprovalDecisionActions.onApprove}
      onDeny={props.pendingToolCallApprovalDecisionActions.onDeny}
    />
  ) : undefined;

  const renderToolCallEntry = resolveToolCallEntryRenderer(toolCallDetail);
  return renderToolCallEntry({
    ...props,
    toolCallDetail,
    approvalDecisionControl,
  });
}

function resolveToolCallEntryRenderer<ToolName extends ToolCallDetailName>(
  toolCallDetail: ToolCallDetailByName<ToolName>,
): ToolCallEntryRenderer<ToolName> {
  return toolCallEntryRendererByName[toolCallDetail.toolName] as ToolCallEntryRenderer<ToolName>;
}

function buildSharedToolCallCardProps(props: ToolCallCardSharedInput): ToolCallCardSharedProps {
  return {
    renderState: props.renderState,
    ...(props.approvalDecisionControl !== undefined ? { approvalDecisionControl: props.approvalDecisionControl } : {}),
    ...(props.durationMs !== undefined ? { durationMs: props.durationMs } : {}),
    ...(props.errorText !== undefined ? { errorText: props.errorText } : {}),
  };
}

function buildWorkspacePatchToolCallCardProps(props: ToolCallCardWorkspacePatchInput): ToolCallCardWorkspacePatchProps {
  return {
    ...buildSharedToolCallCardProps(props),
    ...(props.workspacePatch !== undefined ? { workspacePatch: props.workspacePatch } : {}),
  };
}

function renderReadToolCallEntry(props: ToolCallEntryRendererProps<"read">): ReactNode {
  return <ReadToolCallCard {...buildSharedToolCallCardProps(props)} toolCallDetail={props.toolCallDetail} />;
}

function renderGrepToolCallEntry(props: ToolCallEntryRendererProps<"grep">): ReactNode {
  return <GrepToolCallCard {...buildSharedToolCallCardProps(props)} toolCallDetail={props.toolCallDetail} />;
}

function renderGlobToolCallEntry(props: ToolCallEntryRendererProps<"glob">): ReactNode {
  return <GlobToolCallCard {...buildSharedToolCallCardProps(props)} toolCallDetail={props.toolCallDetail} />;
}

function renderLocateCodebaseSymbolsToolCallEntry(props: ToolCallEntryRendererProps<"locate_codebase_symbols">): ReactNode {
  return <LocateCodebaseSymbolsToolCallCard {...buildSharedToolCallCardProps(props)} toolCallDetail={props.toolCallDetail} />;
}

function renderEditToolCallEntry(props: ToolCallEntryRendererProps<"edit">): ReactNode {
  return <EditToolCallCard {...buildWorkspacePatchToolCallCardProps(props)} toolCallDetail={props.toolCallDetail} />;
}

function renderEditManyToolCallEntry(props: ToolCallEntryRendererProps<"edit_many">): ReactNode {
  return <EditManyToolCallCard {...buildWorkspacePatchToolCallCardProps(props)} toolCallDetail={props.toolCallDetail} />;
}

function renderPatchToolCallEntry(props: ToolCallEntryRendererProps<"patch" | "patch_many">): ReactNode {
  return <PatchToolCallCard {...buildWorkspacePatchToolCallCardProps(props)} toolCallDetail={props.toolCallDetail} />;
}

function renderWriteToolCallEntry(props: ToolCallEntryRendererProps<"write">): ReactNode {
  return <WriteToolCallCard {...buildWorkspacePatchToolCallCardProps(props)} toolCallDetail={props.toolCallDetail} />;
}

function renderBashToolCallEntry(props: ToolCallEntryRendererProps<"bash">): ReactNode {
  return <BashToolCallCard {...buildWorkspacePatchToolCallCardProps(props)} toolCallDetail={props.toolCallDetail} />;
}

function renderTodoWriteToolCallEntry(props: ToolCallEntryRendererProps<"todowrite">): ReactNode {
  return <TodoWriteToolCallCard {...buildSharedToolCallCardProps(props)} toolCallDetail={props.toolCallDetail} />;
}

function renderTaskToolCallEntry(props: ToolCallEntryRendererProps<"task">): ReactNode {
  return (
    <TaskToolCallCard
      renderState={props.renderState}
      toolCallDetail={props.toolCallDetail}
      {...(props.approvalDecisionControl !== undefined ? { approvalDecisionControl: props.approvalDecisionControl } : {})}
      {...(props.durationMs !== undefined ? { durationMs: props.durationMs } : {})}
      {...(props.toolCallStartedAtMs !== undefined ? { toolCallStartedAtMs: props.toolCallStartedAtMs } : {})}
      {...(props.errorText !== undefined ? { errorText: props.errorText } : {})}
    />
  );
}

function renderSkillToolCallEntry(props: ToolCallEntryRendererProps<"skill">): ReactNode {
  return <SkillToolCallCard {...buildSharedToolCallCardProps(props)} toolCallDetail={props.toolCallDetail} />;
}

function renderWorkflowHandoffToolCallEntry(props: ToolCallEntryRendererProps<"record_workflow_handoff">): ReactNode {
  return <WorkflowHandoffToolCallCard {...buildSharedToolCallCardProps(props)} toolCallDetail={props.toolCallDetail} />;
}
