import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  createStartedToolCallDetailFromRequest,
  isFileMutationToolCallRequest as isContractFileMutationToolCallRequest,
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type FileMutationToolCallRequest as ContractFileMutationToolCallRequest,
  type ToolCallDetail,
  type ToolCallRequest,
} from "@buli/contracts";
import type { ProviderConversationTurn } from "./provider.ts";
import { formatAssistantOperatingModeName, isReadOnlyAssistantOperatingMode } from "./assistantOperatingModePolicy.ts";
import { logAssistantResponseEventEmitted, submitProviderToolResultWithDiagnostics } from "./runtimeToolCallExecutionDiagnostics.ts";
import type { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import {
  beginRuntimeWorkspacePatchCapture,
  recordWorkspacePatchAndCreateAssistantEvent,
} from "./runtimeWorkspacePatchCapture.ts";
import {
  prepareEditManyToolCall,
  runPreparedEditManyToolCall,
  type PreparedEditManyToolCall,
} from "./tools/editManyTool.ts";
import {
  prepareEditToolCall,
  runPreparedEditToolCall,
  type PreparedEditToolCall,
} from "./tools/editTool.ts";
import {
  preparePatchManyToolCall,
  preparePatchToolCall,
  runPreparedPatchManyToolCall,
  runPreparedPatchToolCall,
  type PreparedPatchManyToolCall,
  type PreparedPatchToolCall,
} from "./tools/patchTool.ts";
import type { FailedToolCallOutcome, ToolCallOutcome } from "./tools/toolCallOutcome.ts";
import {
  prepareWriteToolCall,
  runPreparedWriteToolCall,
  type PreparedWriteToolCall,
} from "./tools/writeTool.ts";
import type { WorkspaceSnapshotStore } from "./workspaceSnapshot/workspaceSnapshotStore.ts";

export type FileMutationToolCallRequest = ContractFileMutationToolCallRequest;

type PreparedFileMutationToolCall =
  | { toolName: "edit"; preparedEditToolCall: PreparedEditToolCall }
  | { toolName: "edit_many"; preparedEditManyToolCall: PreparedEditManyToolCall }
  | { toolName: "patch"; preparedPatchToolCall: PreparedPatchToolCall }
  | { toolName: "patch_many"; preparedPatchManyToolCall: PreparedPatchManyToolCall }
  | { toolName: "write"; preparedWriteToolCall: PreparedWriteToolCall };

export type StreamAssistantResponseEventsForFileMutationToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  toolCallId: string;
  fileMutationToolCallRequest: FileMutationToolCallRequest;
  assistantOperatingMode: AssistantOperatingMode;
  workspaceRootPath: string;
  workspaceSnapshotStore?: WorkspaceSnapshotStore | undefined;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export async function* streamAssistantResponseEventsForFileMutationToolCall(
  input: StreamAssistantResponseEventsForFileMutationToolCallInput,
): AsyncGenerator<AssistantResponseEvent> {
  const startedToolCallDetail = createStartedToolCallDetailFromRequest(input.fileMutationToolCallRequest);
  const toolCallPartId = randomUUID();
  const toolCallStartedAtMs = Date.now();

  if (isReadOnlyAssistantOperatingMode(input.assistantOperatingMode)) {
    const denialText = `${formatAssistantOperatingModeName(input.assistantOperatingMode)} is read-only, so this ${input.fileMutationToolCallRequest.toolName} tool call was not applied.`;
    input.toolResultSessionRecorder.appendDeniedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: startedToolCallDetail,
      toolResultText: denialText,
      denialExplanation: denialText,
    });
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartAddedEventSchema.parse({
      type: "assistant_message_part_added",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: input.toolCallId,
        toolCallStatus: "denied",
        toolCallStartedAtMs,
        toolCallDetail: startedToolCallDetail,
        denialText,
      }),
    }));
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: input.toolCallId,
      toolResultText: denialText,
      toolResultKind: "denied",
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  input.throwIfConversationTurnInterrupted();
  const preparedFileMutationToolCall = await prepareFileMutationToolCall({
    fileMutationToolCallRequest: input.fileMutationToolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    abortSignal: input.abortSignal,
  });
  input.throwIfConversationTurnInterrupted();

  if (isFailedToolCallOutcome(preparedFileMutationToolCall)) {
    input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: preparedFileMutationToolCall.toolCallDetail,
      toolResultText: preparedFileMutationToolCall.toolResultText,
      failureExplanation: preparedFileMutationToolCall.failureExplanation,
    });
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartAddedEventSchema.parse({
      type: "assistant_message_part_added",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: input.toolCallId,
        toolCallStatus: "failed",
        toolCallStartedAtMs,
        toolCallDetail: preparedFileMutationToolCall.toolCallDetail,
        errorText: preparedFileMutationToolCall.failureExplanation,
        durationMs: preparedFileMutationToolCall.durationMilliseconds,
      }),
    }));
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: input.toolCallId,
      toolResultText: preparedFileMutationToolCall.toolResultText,
      toolResultKind: "failed",
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  const preparedToolCallDetail = getPreparedFileMutationToolCallDetail(preparedFileMutationToolCall);
  yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartAddedEventSchema.parse({
    type: "assistant_message_part_added",
    messageId: input.assistantResponseMessageId,
    part: AssistantToolCallConversationMessagePartSchema.parse({
      id: toolCallPartId,
      partKind: "assistant_tool_call",
      toolCallId: input.toolCallId,
      toolCallStatus: "running",
      toolCallStartedAtMs,
      toolCallDetail: preparedToolCallDetail,
    }),
  }));

  input.throwIfConversationTurnInterrupted();
  const workspacePatchCapture = await beginRuntimeWorkspacePatchCapture({
    workspaceSnapshotStore: input.workspaceSnapshotStore,
    toolCallId: input.toolCallId,
    abortSignal: input.abortSignal,
    diagnosticLogger: input.diagnosticLogger,
  });
  const toolCallOutcome = await runPreparedFileMutationToolCall({
    preparedFileMutationToolCall,
    workspaceRootPath: input.workspaceRootPath,
    abortSignal: input.abortSignal,
  });
  const workspacePatch = await workspacePatchCapture?.captureWorkspacePatch();
  input.throwIfConversationTurnInterrupted();

  if (toolCallOutcome.outcomeKind === "completed") {
    input.toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: toolCallOutcome.toolCallDetail,
      toolResultText: toolCallOutcome.toolResultText,
    });
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
      type: "assistant_message_part_updated",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: input.toolCallId,
        toolCallStatus: "completed",
        toolCallStartedAtMs,
        toolCallDetail: toolCallOutcome.toolCallDetail,
        durationMs: toolCallOutcome.durationMilliseconds,
      }),
    }));
    const workspacePatchEvent = recordWorkspacePatchAndCreateAssistantEvent({
      workspacePatch,
      assistantResponseMessageId: input.assistantResponseMessageId,
      toolResultSessionRecorder: input.toolResultSessionRecorder,
    });
    if (workspacePatchEvent) {
      yield logAssistantResponseEventEmitted(input.diagnosticLogger, workspacePatchEvent);
    }
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: input.toolCallId,
      toolResultText: toolCallOutcome.toolResultText,
      toolResultKind: "completed",
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
    toolCallId: input.toolCallId,
    toolCallDetail: toolCallOutcome.toolCallDetail,
    toolResultText: toolCallOutcome.toolResultText,
    failureExplanation: toolCallOutcome.failureExplanation,
  });
  yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
    type: "assistant_message_part_updated",
    messageId: input.assistantResponseMessageId,
    part: AssistantToolCallConversationMessagePartSchema.parse({
      id: toolCallPartId,
      partKind: "assistant_tool_call",
      toolCallId: input.toolCallId,
      toolCallStatus: "failed",
      toolCallStartedAtMs,
      toolCallDetail: toolCallOutcome.toolCallDetail,
      errorText: toolCallOutcome.failureExplanation,
      durationMs: toolCallOutcome.durationMilliseconds,
    }),
  }));
  const workspacePatchEvent = recordWorkspacePatchAndCreateAssistantEvent({
    workspacePatch,
    assistantResponseMessageId: input.assistantResponseMessageId,
    toolResultSessionRecorder: input.toolResultSessionRecorder,
  });
  if (workspacePatchEvent) {
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, workspacePatchEvent);
  }
  await submitProviderToolResultWithDiagnostics({
    providerConversationTurn: input.providerConversationTurn,
    toolCallId: input.toolCallId,
    toolResultText: toolCallOutcome.toolResultText,
    toolResultKind: "failed",
    diagnosticLogger: input.diagnosticLogger,
  });
}

export function isFileMutationToolCallRequest(
  toolCallRequest: ToolCallRequest,
): toolCallRequest is FileMutationToolCallRequest {
  return isContractFileMutationToolCallRequest(toolCallRequest);
}

async function prepareFileMutationToolCall(input: {
  fileMutationToolCallRequest: FileMutationToolCallRequest;
  workspaceRootPath: string;
  abortSignal: AbortSignal;
}): Promise<PreparedFileMutationToolCall | FailedToolCallOutcome> {
  if (input.fileMutationToolCallRequest.toolName === "edit") {
    const editPreparationOutcome = await prepareEditToolCall({
      editToolCallRequest: input.fileMutationToolCallRequest,
      workspaceRootPath: input.workspaceRootPath,
      abortSignal: input.abortSignal,
    });
    if (isFailedToolCallOutcome(editPreparationOutcome)) {
      return editPreparationOutcome;
    }

    return { toolName: "edit", preparedEditToolCall: editPreparationOutcome.preparedEditToolCall };
  }

  if (input.fileMutationToolCallRequest.toolName === "edit_many") {
    const editManyPreparationOutcome = await prepareEditManyToolCall({
      editManyToolCallRequest: input.fileMutationToolCallRequest,
      workspaceRootPath: input.workspaceRootPath,
      abortSignal: input.abortSignal,
    });
    if (isFailedToolCallOutcome(editManyPreparationOutcome)) {
      return editManyPreparationOutcome;
    }

    return { toolName: "edit_many", preparedEditManyToolCall: editManyPreparationOutcome.preparedEditManyToolCall };
  }

  if (input.fileMutationToolCallRequest.toolName === "patch") {
    const patchPreparationOutcome = await preparePatchToolCall({
      patchToolCallRequest: input.fileMutationToolCallRequest,
      workspaceRootPath: input.workspaceRootPath,
      abortSignal: input.abortSignal,
    });
    if (isFailedToolCallOutcome(patchPreparationOutcome)) {
      return patchPreparationOutcome;
    }

    return { toolName: "patch", preparedPatchToolCall: patchPreparationOutcome.preparedPatchToolCall };
  }

  if (input.fileMutationToolCallRequest.toolName === "patch_many") {
    const patchManyPreparationOutcome = await preparePatchManyToolCall({
      patchManyToolCallRequest: input.fileMutationToolCallRequest,
      workspaceRootPath: input.workspaceRootPath,
      abortSignal: input.abortSignal,
    });
    if (isFailedToolCallOutcome(patchManyPreparationOutcome)) {
      return patchManyPreparationOutcome;
    }

    return { toolName: "patch_many", preparedPatchManyToolCall: patchManyPreparationOutcome.preparedPatchManyToolCall };
  }

  if (input.fileMutationToolCallRequest.toolName === "write") {
    const writePreparationOutcome = await prepareWriteToolCall({
      writeToolCallRequest: input.fileMutationToolCallRequest,
      workspaceRootPath: input.workspaceRootPath,
      abortSignal: input.abortSignal,
    });
    if (isFailedToolCallOutcome(writePreparationOutcome)) {
      return writePreparationOutcome;
    }

    return { toolName: "write", preparedWriteToolCall: writePreparationOutcome.preparedWriteToolCall };
  }

  return assertUnhandledFileMutationToolCallRequest(input.fileMutationToolCallRequest);
}

function getPreparedFileMutationToolCallDetail(preparedFileMutationToolCall: PreparedFileMutationToolCall): ToolCallDetail {
  if (preparedFileMutationToolCall.toolName === "edit") {
    return preparedFileMutationToolCall.preparedEditToolCall.toolCallDetail;
  }
  if (preparedFileMutationToolCall.toolName === "edit_many") {
    return preparedFileMutationToolCall.preparedEditManyToolCall.toolCallDetail;
  }
  if (preparedFileMutationToolCall.toolName === "patch") {
    return preparedFileMutationToolCall.preparedPatchToolCall.toolCallDetail;
  }
  if (preparedFileMutationToolCall.toolName === "patch_many") {
    return preparedFileMutationToolCall.preparedPatchManyToolCall.toolCallDetail;
  }
  if (preparedFileMutationToolCall.toolName === "write") {
    return preparedFileMutationToolCall.preparedWriteToolCall.toolCallDetail;
  }

  return assertUnhandledPreparedFileMutationToolCall(preparedFileMutationToolCall);
}

function runPreparedFileMutationToolCall(input: {
  preparedFileMutationToolCall: PreparedFileMutationToolCall;
  workspaceRootPath: string;
  abortSignal: AbortSignal;
}): Promise<ToolCallOutcome> {
  if (input.preparedFileMutationToolCall.toolName === "edit") {
    return runPreparedEditToolCall({
      preparedEditToolCall: input.preparedFileMutationToolCall.preparedEditToolCall,
      abortSignal: input.abortSignal,
    });
  }

  if (input.preparedFileMutationToolCall.toolName === "edit_many") {
    return runPreparedEditManyToolCall({
      preparedEditManyToolCall: input.preparedFileMutationToolCall.preparedEditManyToolCall,
      abortSignal: input.abortSignal,
    });
  }

  if (input.preparedFileMutationToolCall.toolName === "patch") {
    return runPreparedPatchToolCall({
      preparedPatchToolCall: input.preparedFileMutationToolCall.preparedPatchToolCall,
      abortSignal: input.abortSignal,
    });
  }

  if (input.preparedFileMutationToolCall.toolName === "patch_many") {
    return runPreparedPatchManyToolCall({
      preparedPatchManyToolCall: input.preparedFileMutationToolCall.preparedPatchManyToolCall,
      abortSignal: input.abortSignal,
    });
  }

  if (input.preparedFileMutationToolCall.toolName === "write") {
    return runPreparedWriteToolCall({
      preparedWriteToolCall: input.preparedFileMutationToolCall.preparedWriteToolCall,
      workspaceRootPath: input.workspaceRootPath,
      abortSignal: input.abortSignal,
    });
  }

  return assertUnhandledPreparedFileMutationToolCall(input.preparedFileMutationToolCall);
}

function assertUnhandledFileMutationToolCallRequest(fileMutationToolCallRequest: never): never {
  throw new Error(`Unhandled file mutation tool call request: ${JSON.stringify(fileMutationToolCallRequest)}`);
}

function assertUnhandledPreparedFileMutationToolCall(preparedFileMutationToolCall: never): never {
  throw new Error(`Unhandled prepared file mutation tool call: ${JSON.stringify(preparedFileMutationToolCall)}`);
}

function isFailedToolCallOutcome(value: unknown): value is FailedToolCallOutcome {
  return typeof value === "object" && value !== null && "outcomeKind" in value && value.outcomeKind === "failed";
}
