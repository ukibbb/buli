import type { ConversationSessionEntry, ModelContextItem } from "@buli/contracts";
import { projectConversationSessionEntriesToModelContextItems } from "./conversationHistoryProjection.ts";

export type ConversationSessionEntriesChangedListener = (
  conversationSessionEntries: readonly ConversationSessionEntry[],
) => void;

export class InMemoryConversationHistory {
  readonly conversationSessionEntries: ConversationSessionEntry[];
  readonly onConversationSessionEntriesChanged: ConversationSessionEntriesChangedListener | undefined;

  constructor(input?: {
    initialConversationSessionEntries?: readonly ConversationSessionEntry[];
    onConversationSessionEntriesChanged?: ConversationSessionEntriesChangedListener;
  }) {
    this.conversationSessionEntries = [...(input?.initialConversationSessionEntries ?? [])];
    this.onConversationSessionEntriesChanged = input?.onConversationSessionEntriesChanged;
  }

  appendConversationSessionEntry(conversationSessionEntry: ConversationSessionEntry): void {
    this.conversationSessionEntries.push(conversationSessionEntry);
    this.onConversationSessionEntriesChanged?.(this.listConversationSessionEntries());
  }

  listConversationSessionEntries(): readonly ConversationSessionEntry[] {
    return [...this.conversationSessionEntries];
  }

  listModelContextItems(): readonly ModelContextItem[] {
    return projectConversationSessionEntriesToModelContextItems(this.conversationSessionEntries);
  }
}
