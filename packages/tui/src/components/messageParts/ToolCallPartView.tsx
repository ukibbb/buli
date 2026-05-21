import type { ReactNode } from "react";
import type { AssistantToolCallConversationMessagePart, WorkspacePatch } from "@buli/contracts";
import { ToolCallEntryView } from "../toolCalls/ToolCallEntryView.tsx";

function resolveToolCallRenderState(toolCallStatus: AssistantToolCallConversationMessagePart["toolCallStatus"]):
  | "streaming"
  | "completed"
  | "failed" {
  if (toolCallStatus === "completed") {
    return "completed";
  }

  if (toolCallStatus === "failed" || toolCallStatus === "denied" || toolCallStatus === "interrupted") {
    return "failed";
  }

  return "streaming";
}

export function ToolCallPartView(props: {
  assistantToolCallConversationMessagePart: AssistantToolCallConversationMessagePart;
  workspacePatch?: WorkspacePatch;
}): ReactNode {
  return (
    <ToolCallEntryView
      renderState={resolveToolCallRenderState(props.assistantToolCallConversationMessagePart.toolCallStatus)}
      toolCallDetail={props.assistantToolCallConversationMessagePart.toolCallDetail}
      {...(props.workspacePatch !== undefined ? { workspacePatch: props.workspacePatch } : {})}
      {...(props.assistantToolCallConversationMessagePart.durationMs !== undefined
        ? { durationMs: props.assistantToolCallConversationMessagePart.durationMs }
        : {})}
      {...(props.assistantToolCallConversationMessagePart.toolCallStatus === "failed" &&
      props.assistantToolCallConversationMessagePart.errorText
        ? { errorText: props.assistantToolCallConversationMessagePart.errorText }
        : {})}
      {...(props.assistantToolCallConversationMessagePart.toolCallStatus === "interrupted" &&
      props.assistantToolCallConversationMessagePart.errorText
        ? { errorText: props.assistantToolCallConversationMessagePart.errorText }
        : {})}
      {...(props.assistantToolCallConversationMessagePart.toolCallStatus === "denied" &&
      props.assistantToolCallConversationMessagePart.denialText
        ? { errorText: props.assistantToolCallConversationMessagePart.denialText }
        : {})}
    />
  );
}
