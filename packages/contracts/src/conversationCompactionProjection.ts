import type { AssistantOperatingMode } from "./assistantOperatingMode.ts";
import type { ConversationCompactionSummaryConversationSessionEntry, ConversationSessionEntry } from "./conversationSessionEntry.ts";
import type {
  ImplementationWorkflowHandoff,
  PlanWorkflowHandoff,
  UnderstandingWorkflowHandoff,
} from "./workflowHandoff.ts";

export type LatestConversationCompactionBoundary = {
  compactionSummaryEntry: ConversationCompactionSummaryConversationSessionEntry;
  compactionSummaryEntryIndex: number;
};

export type LatestVisibleWorkflowHandoffCheckpoint = {
  latestUnderstandingWorkflowHandoff?: UnderstandingWorkflowHandoff | undefined;
  latestPlanWorkflowHandoff?: PlanWorkflowHandoff | undefined;
  latestImplementationWorkflowHandoff?: ImplementationWorkflowHandoff | undefined;
};

export function findLatestConversationCompactionBoundary(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): LatestConversationCompactionBoundary | undefined {
  const compactionSummaryEntryIndex = conversationSessionEntries.findLastIndex(
    (conversationSessionEntry) => conversationSessionEntry.entryKind === "conversation_compaction_summary",
  );
  if (compactionSummaryEntryIndex === -1) {
    return undefined;
  }

  const compactionSummaryEntry = conversationSessionEntries[compactionSummaryEntryIndex];
  if (!compactionSummaryEntry || compactionSummaryEntry.entryKind !== "conversation_compaction_summary") {
    return undefined;
  }

  return {
    compactionSummaryEntry,
    compactionSummaryEntryIndex,
  };
}

export function listModelVisibleConversationSessionEntries(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): readonly ConversationSessionEntry[] {
  const latestCompactionBoundary = findLatestConversationCompactionBoundary(conversationSessionEntries);
  if (!latestCompactionBoundary) {
    return conversationSessionEntries;
  }

  return [
    latestCompactionBoundary.compactionSummaryEntry,
    ...conversationSessionEntries.slice(latestCompactionBoundary.compactionSummaryEntryIndex + 1),
  ];
}

export function findLatestVisibleCompletedAssistantOperatingMode(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): AssistantOperatingMode | undefined {
  const visibleConversationSessionEntries = listModelVisibleConversationSessionEntries(conversationSessionEntries);

  for (let entryIndex = visibleConversationSessionEntries.length - 1; entryIndex >= 0; entryIndex -= 1) {
    const conversationSessionEntry = visibleConversationSessionEntries[entryIndex];
    if (
      conversationSessionEntry?.entryKind === "assistant_message" &&
      conversationSessionEntry.assistantMessageStatus === "completed" &&
      conversationSessionEntry.assistantOperatingMode !== undefined
    ) {
      return conversationSessionEntry.assistantOperatingMode;
    }
  }

  const latestVisibleCompactionSummaryEntry = visibleConversationSessionEntries.find(
    (conversationSessionEntry): conversationSessionEntry is ConversationCompactionSummaryConversationSessionEntry =>
      conversationSessionEntry.entryKind === "conversation_compaction_summary",
  );

  return latestVisibleCompactionSummaryEntry?.latestCompletedAssistantOperatingMode;
}

export function findLatestVisibleWorkflowHandoffCheckpoint(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): LatestVisibleWorkflowHandoffCheckpoint {
  const visibleConversationSessionEntries = listModelVisibleConversationSessionEntries(conversationSessionEntries);
  let latestUnderstandingWorkflowHandoff: UnderstandingWorkflowHandoff | undefined;
  let latestPlanWorkflowHandoff: PlanWorkflowHandoff | undefined;
  let latestImplementationWorkflowHandoff: ImplementationWorkflowHandoff | undefined;

  for (let entryIndex = visibleConversationSessionEntries.length - 1; entryIndex >= 0; entryIndex -= 1) {
    const conversationSessionEntry = visibleConversationSessionEntries[entryIndex];
    if (!conversationSessionEntry) {
      continue;
    }

    if (
      conversationSessionEntry.entryKind === "assistant_message" &&
      conversationSessionEntry.assistantMessageStatus === "completed" &&
      conversationSessionEntry.workflowHandoff !== undefined
    ) {
      if (conversationSessionEntry.workflowHandoff.handoffKind === "understanding" && latestUnderstandingWorkflowHandoff === undefined) {
        latestUnderstandingWorkflowHandoff = conversationSessionEntry.workflowHandoff;
      }
      if (conversationSessionEntry.workflowHandoff.handoffKind === "plan" && latestPlanWorkflowHandoff === undefined) {
        latestPlanWorkflowHandoff = conversationSessionEntry.workflowHandoff;
      }
      if (
        conversationSessionEntry.workflowHandoff.handoffKind === "implementation" &&
        latestImplementationWorkflowHandoff === undefined
      ) {
        latestImplementationWorkflowHandoff = conversationSessionEntry.workflowHandoff;
      }
      continue;
    }

    if (conversationSessionEntry.entryKind === "conversation_compaction_summary") {
      if (latestUnderstandingWorkflowHandoff === undefined) {
        latestUnderstandingWorkflowHandoff = conversationSessionEntry.latestUnderstandingWorkflowHandoff;
      }
      if (latestPlanWorkflowHandoff === undefined) {
        latestPlanWorkflowHandoff = conversationSessionEntry.latestPlanWorkflowHandoff;
      }
      if (latestImplementationWorkflowHandoff === undefined) {
        latestImplementationWorkflowHandoff = conversationSessionEntry.latestImplementationWorkflowHandoff;
      }
    }
  }

  return {
    ...(latestUnderstandingWorkflowHandoff !== undefined
      ? { latestUnderstandingWorkflowHandoff }
      : {}),
    ...(latestPlanWorkflowHandoff !== undefined ? { latestPlanWorkflowHandoff } : {}),
    ...(latestImplementationWorkflowHandoff !== undefined
      ? { latestImplementationWorkflowHandoff }
      : {}),
  };
}
