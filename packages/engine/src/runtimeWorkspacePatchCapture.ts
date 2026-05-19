import type { AssistantResponseEvent, BuliDiagnosticLogger, WorkspacePatch } from "@buli/contracts";
import { AssistantMessagePartAddedEventSchema, AssistantWorkspacePatchConversationMessagePartSchema } from "@buli/contracts";
import { randomUUID } from "node:crypto";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";
import type { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import type { WorkspaceSnapshotStore } from "./workspaceSnapshot/workspaceSnapshotStore.ts";

export type RuntimeWorkspacePatchCapture = {
  captureWorkspacePatch(): Promise<WorkspacePatch | undefined>;
};

export async function beginRuntimeWorkspacePatchCapture(input: {
  workspaceSnapshotStore: WorkspaceSnapshotStore | undefined;
  toolCallId: string;
  abortSignal: AbortSignal;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): Promise<RuntimeWorkspacePatchCapture | undefined> {
  if (!input.workspaceSnapshotStore) {
    return undefined;
  }

  try {
    const baselineSnapshotHash = await input.workspaceSnapshotStore.trackWorkspaceSnapshot({ abortSignal: input.abortSignal });
    if (!baselineSnapshotHash) {
      return undefined;
    }

    logEngineDiagnosticEvent(input.diagnosticLogger, "workspace_patch.baseline_captured", {
      toolCallId: input.toolCallId,
      baselineSnapshotHash,
    });

    return {
      captureWorkspacePatch: async () => {
        try {
          const workspacePatch = await input.workspaceSnapshotStore?.captureWorkspacePatch({
            baselineSnapshotHash,
            toolCallId: input.toolCallId,
            abortSignal: input.abortSignal,
          });
          if (workspacePatch) {
            logEngineDiagnosticEvent(input.diagnosticLogger, "workspace_patch.captured", {
              toolCallId: input.toolCallId,
              workspacePatchId: workspacePatch.workspacePatchId,
              changedFileCount: workspacePatch.changedFileCount,
              addedLineCount: workspacePatch.addedLineCount,
              removedLineCount: workspacePatch.removedLineCount,
            });
          }
          return workspacePatch;
        } catch (error) {
          logWorkspacePatchCaptureFailure(input.diagnosticLogger, input.toolCallId, error);
          return undefined;
        }
      },
    };
  } catch (error) {
    logWorkspacePatchCaptureFailure(input.diagnosticLogger, input.toolCallId, error);
    return undefined;
  }
}

export function recordWorkspacePatchAndCreateAssistantEvent(input: {
  workspacePatch: WorkspacePatch | undefined;
  assistantResponseMessageId: string;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
}): AssistantResponseEvent | undefined {
  if (!input.workspacePatch) {
    return undefined;
  }

  input.toolResultSessionRecorder.appendWorkspacePatchSessionEntry({ workspacePatch: input.workspacePatch });
  return AssistantMessagePartAddedEventSchema.parse({
    type: "assistant_message_part_added",
    messageId: input.assistantResponseMessageId,
    part: AssistantWorkspacePatchConversationMessagePartSchema.parse({
      id: `workspace-patch-${randomUUID()}`,
      partKind: "assistant_workspace_patch",
      workspacePatch: input.workspacePatch,
    }),
  });
}

function logWorkspacePatchCaptureFailure(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  toolCallId: string,
  error: unknown,
): void {
  logEngineDiagnosticEvent(diagnosticLogger, "workspace_patch.capture_failed", {
    toolCallId,
    failureExplanation: error instanceof Error ? error.message : String(error),
  });
}
