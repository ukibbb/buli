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
} from "./tools/editManyTool.ts";
import {
  prepareEditToolCall,
  runPreparedEditToolCall,
} from "./tools/editTool.ts";
import {
  preparePatchManyToolCall,
  preparePatchToolCall,
  runPreparedPatchManyToolCall,
  runPreparedPatchToolCall,
} from "./tools/patchTool.ts";
import type { FailedToolCallOutcome, ToolCallOutcome } from "./tools/toolCallOutcome.ts";
import {
  prepareWriteToolCall,
  runPreparedWriteToolCall,
} from "./tools/writeTool.ts";
import type { WorkspaceSnapshotStore } from "./workspaceSnapshot/workspaceSnapshotStore.ts";

export type FileMutationToolCallRequest = ContractFileMutationToolCallRequest;

type PreparedFileMutationToolCallRunInput = {
  workspaceRootPath: string;
  abortSignal: AbortSignal;
};

type PreparedFileMutationToolCall = {
  toolName: FileMutationToolCallRequest["toolName"];
  toolCallDetail: ToolCallDetail;
  runPreparedToolCall(input: PreparedFileMutationToolCallRunInput): Promise<ToolCallOutcome>;
};

type FileMutationToolName = FileMutationToolCallRequest["toolName"];
type FileMutationToolCallRequestByName<ToolName extends FileMutationToolName> = Extract<
  FileMutationToolCallRequest,
  { toolName: ToolName }
>;

type PrepareFileMutationToolCallInput<ToolName extends FileMutationToolName> = {
  fileMutationToolCallRequest: FileMutationToolCallRequestByName<ToolName>;
  workspaceRootPath: string;
  abortSignal: AbortSignal;
};

type FileMutationToolCallPreparer<ToolName extends FileMutationToolName> = (
  input: PrepareFileMutationToolCallInput<ToolName>,
) => Promise<PreparedFileMutationToolCall | FailedToolCallOutcome>;

const fileMutationToolCallPreparerByName: {
  readonly [ToolName in FileMutationToolName]: FileMutationToolCallPreparer<ToolName>;
} = {
  edit: prepareEditFileMutationToolCall,
  edit_many: prepareEditManyFileMutationToolCall,
  patch: preparePatchFileMutationToolCall,
  patch_many: preparePatchManyFileMutationToolCall,
  write: prepareWriteFileMutationToolCall,
};

export type StreamAssistantResponseEventsForFileMutationToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  conversationTurnId: string;
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
      conversationTurnId: input.conversationTurnId,
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
      conversationTurnId: input.conversationTurnId,
      toolCallId: input.toolCallId,
      toolResultText: preparedFileMutationToolCall.toolResultText,
      toolResultKind: "failed",
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartAddedEventSchema.parse({
    type: "assistant_message_part_added",
    messageId: input.assistantResponseMessageId,
    part: AssistantToolCallConversationMessagePartSchema.parse({
      id: toolCallPartId,
      partKind: "assistant_tool_call",
        toolCallId: input.toolCallId,
        toolCallStatus: "running",
        toolCallStartedAtMs,
        toolCallDetail: preparedFileMutationToolCall.toolCallDetail,
      }),
    }));

  input.throwIfConversationTurnInterrupted();
  const workspacePatchCapture = await beginRuntimeWorkspacePatchCapture({
    workspaceSnapshotStore: input.workspaceSnapshotStore,
    toolCallId: input.toolCallId,
    abortSignal: input.abortSignal,
    diagnosticLogger: input.diagnosticLogger,
  });
  const toolCallOutcome = await preparedFileMutationToolCall.runPreparedToolCall({
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
      conversationTurnId: input.conversationTurnId,
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
    conversationTurnId: input.conversationTurnId,
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
  const fileMutationToolCallPreparer = resolveFileMutationToolCallPreparer(input.fileMutationToolCallRequest);
  return fileMutationToolCallPreparer(input);
}

function resolveFileMutationToolCallPreparer<ToolName extends FileMutationToolName>(
  fileMutationToolCallRequest: FileMutationToolCallRequestByName<ToolName>,
): FileMutationToolCallPreparer<ToolName> {
  return fileMutationToolCallPreparerByName[fileMutationToolCallRequest.toolName] as FileMutationToolCallPreparer<ToolName>;
}

async function prepareEditFileMutationToolCall(
  input: PrepareFileMutationToolCallInput<"edit">,
): Promise<PreparedFileMutationToolCall | FailedToolCallOutcome> {
  const editPreparationOutcome = await prepareEditToolCall({
    editToolCallRequest: input.fileMutationToolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    abortSignal: input.abortSignal,
  });
  if (isFailedToolCallOutcome(editPreparationOutcome)) {
    return editPreparationOutcome;
  }

  return {
    toolName: "edit",
    toolCallDetail: editPreparationOutcome.preparedEditToolCall.toolCallDetail,
    runPreparedToolCall: (runInput) =>
      runPreparedEditToolCall({
        preparedEditToolCall: editPreparationOutcome.preparedEditToolCall,
        abortSignal: runInput.abortSignal,
      }),
  };
}

async function prepareEditManyFileMutationToolCall(
  input: PrepareFileMutationToolCallInput<"edit_many">,
): Promise<PreparedFileMutationToolCall | FailedToolCallOutcome> {
  const editManyPreparationOutcome = await prepareEditManyToolCall({
    editManyToolCallRequest: input.fileMutationToolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    abortSignal: input.abortSignal,
  });
  if (isFailedToolCallOutcome(editManyPreparationOutcome)) {
    return editManyPreparationOutcome;
  }

  return {
    toolName: "edit_many",
    toolCallDetail: editManyPreparationOutcome.preparedEditManyToolCall.toolCallDetail,
    runPreparedToolCall: (runInput) =>
      runPreparedEditManyToolCall({
        preparedEditManyToolCall: editManyPreparationOutcome.preparedEditManyToolCall,
        abortSignal: runInput.abortSignal,
      }),
  };
}

async function preparePatchFileMutationToolCall(
  input: PrepareFileMutationToolCallInput<"patch">,
): Promise<PreparedFileMutationToolCall | FailedToolCallOutcome> {
  const patchPreparationOutcome = await preparePatchToolCall({
    patchToolCallRequest: input.fileMutationToolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    abortSignal: input.abortSignal,
  });
  if (isFailedToolCallOutcome(patchPreparationOutcome)) {
    return patchPreparationOutcome;
  }

  return {
    toolName: "patch",
    toolCallDetail: patchPreparationOutcome.preparedPatchToolCall.toolCallDetail,
    runPreparedToolCall: (runInput) =>
      runPreparedPatchToolCall({
        preparedPatchToolCall: patchPreparationOutcome.preparedPatchToolCall,
        abortSignal: runInput.abortSignal,
      }),
  };
}

async function preparePatchManyFileMutationToolCall(
  input: PrepareFileMutationToolCallInput<"patch_many">,
): Promise<PreparedFileMutationToolCall | FailedToolCallOutcome> {
  const patchManyPreparationOutcome = await preparePatchManyToolCall({
    patchManyToolCallRequest: input.fileMutationToolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    abortSignal: input.abortSignal,
  });
  if (isFailedToolCallOutcome(patchManyPreparationOutcome)) {
    return patchManyPreparationOutcome;
  }

  return {
    toolName: "patch_many",
    toolCallDetail: patchManyPreparationOutcome.preparedPatchManyToolCall.toolCallDetail,
    runPreparedToolCall: (runInput) =>
      runPreparedPatchManyToolCall({
        preparedPatchManyToolCall: patchManyPreparationOutcome.preparedPatchManyToolCall,
        abortSignal: runInput.abortSignal,
      }),
  };
}

async function prepareWriteFileMutationToolCall(
  input: PrepareFileMutationToolCallInput<"write">,
): Promise<PreparedFileMutationToolCall | FailedToolCallOutcome> {
  const writePreparationOutcome = await prepareWriteToolCall({
    writeToolCallRequest: input.fileMutationToolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    abortSignal: input.abortSignal,
  });
  if (isFailedToolCallOutcome(writePreparationOutcome)) {
    return writePreparationOutcome;
  }

  return {
    toolName: "write",
    toolCallDetail: writePreparationOutcome.preparedWriteToolCall.toolCallDetail,
    runPreparedToolCall: (runInput) =>
      runPreparedWriteToolCall({
        preparedWriteToolCall: writePreparationOutcome.preparedWriteToolCall,
        workspaceRootPath: runInput.workspaceRootPath,
        abortSignal: runInput.abortSignal,
      }),
  };
}

function isFailedToolCallOutcome(value: unknown): value is FailedToolCallOutcome {
  return typeof value === "object" && value !== null && "outcomeKind" in value && value.outcomeKind === "failed";
}
