import {
  isExploreToolCallRequest,
  isWorkspaceInspectionToolCallRequest,
  type ExploreToolCallRequest,
  type ProviderRequestedToolCall,
  type ToolCallRequest,
  type WorkspaceInspectionToolCallRequest,
} from "@buli/contracts";

export type AutoApprovedReadOnlyRequestedToolCall = {
  toolCallId: string;
  toolCallRequest: WorkspaceInspectionToolCallRequest;
};

export type AutoConcurrentToolCallRequest = WorkspaceInspectionToolCallRequest | ExploreToolCallRequest;

export type AutoConcurrentRequestedToolCall = {
  toolCallId: string;
  toolCallRequest: AutoConcurrentToolCallRequest;
};

export type RequestedToolCallExecutionGroup =
  | {
    groupKind: "auto_concurrent";
    requestedToolCalls: AutoConcurrentRequestedToolCall[];
  }
  | {
    groupKind: "serial";
    requestedToolCall: ProviderRequestedToolCall;
  };

export function areAllAutoApprovedReadOnlyToolCalls(
  requestedToolCalls: readonly ProviderRequestedToolCall[],
): requestedToolCalls is readonly AutoApprovedReadOnlyRequestedToolCall[] {
  return requestedToolCalls.every((requestedToolCall) => isWorkspaceInspectionToolCallRequest(requestedToolCall.toolCallRequest));
}

export function groupRequestedToolCallsForExecution(
  requestedToolCalls: readonly ProviderRequestedToolCall[],
): RequestedToolCallExecutionGroup[] {
  const requestedToolCallExecutionGroups: RequestedToolCallExecutionGroup[] = [];
  let currentAutoConcurrentRequestedToolCalls: AutoConcurrentRequestedToolCall[] = [];

  for (const requestedToolCall of requestedToolCalls) {
    if (isAutoConcurrentToolCallRequest(requestedToolCall.toolCallRequest)) {
      currentAutoConcurrentRequestedToolCalls.push({
        toolCallId: requestedToolCall.toolCallId,
        toolCallRequest: requestedToolCall.toolCallRequest,
      });
      continue;
    }

    if (currentAutoConcurrentRequestedToolCalls.length > 0) {
      appendAutoConcurrentRequestedToolCallGroup(requestedToolCallExecutionGroups, currentAutoConcurrentRequestedToolCalls);
      currentAutoConcurrentRequestedToolCalls = [];
    }

    requestedToolCallExecutionGroups.push({
      groupKind: "serial",
      requestedToolCall,
    });
  }

  if (currentAutoConcurrentRequestedToolCalls.length > 0) {
    appendAutoConcurrentRequestedToolCallGroup(requestedToolCallExecutionGroups, currentAutoConcurrentRequestedToolCalls);
  }

  return requestedToolCallExecutionGroups;
}

function appendAutoConcurrentRequestedToolCallGroup(
  requestedToolCallExecutionGroups: RequestedToolCallExecutionGroup[],
  requestedToolCalls: AutoConcurrentRequestedToolCall[],
): void {
  if (requestedToolCalls.length === 1) {
    const [requestedToolCall] = requestedToolCalls;
    if (!requestedToolCall) {
      throw new Error("Missing requested tool call in singleton execution group.");
    }

    requestedToolCallExecutionGroups.push({
      groupKind: "serial",
      requestedToolCall,
    });
    return;
  }

  requestedToolCallExecutionGroups.push({
    groupKind: "auto_concurrent",
    requestedToolCalls,
  });
}

export function isAutoConcurrentToolCallRequest(toolCallRequest: ToolCallRequest): toolCallRequest is AutoConcurrentToolCallRequest {
  return isWorkspaceInspectionToolCallRequest(toolCallRequest) || isExploreToolCallRequest(toolCallRequest);
}
