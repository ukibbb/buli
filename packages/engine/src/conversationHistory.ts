import type { ConversationSessionEntry, ModelContextItem } from "@buli/contracts";
import { projectConversationSessionEntriesToModelContextItems } from "./conversationHistoryProjection.ts";

export type ConversationSessionEntriesChangedListener = (
  conversationSessionEntries: readonly ConversationSessionEntry[],
) => void;

export type ConversationSessionEntryAppendedListener = (
  conversationSessionEntry: ConversationSessionEntry,
  conversationSessionEntries: readonly ConversationSessionEntry[],
) => void;

export class InMemoryConversationHistory {
  readonly conversationSessionEntries: ConversationSessionEntry[];
  readonly onConversationSessionEntriesChanged: ConversationSessionEntriesChangedListener | undefined;
  readonly onConversationSessionEntryAppended: ConversationSessionEntryAppendedListener | undefined;

  constructor(input?: {
    initialConversationSessionEntries?: readonly ConversationSessionEntry[];
    onConversationSessionEntriesChanged?: ConversationSessionEntriesChangedListener;
    onConversationSessionEntryAppended?: ConversationSessionEntryAppendedListener;
  }) {
    this.conversationSessionEntries = [...(input?.initialConversationSessionEntries ?? [])];
    this.onConversationSessionEntriesChanged = input?.onConversationSessionEntriesChanged;
    this.onConversationSessionEntryAppended = input?.onConversationSessionEntryAppended;
  }

  appendConversationSessionEntry(conversationSessionEntry: ConversationSessionEntry): void {
    this.conversationSessionEntries.push(conversationSessionEntry);
    const conversationSessionEntries = this.listConversationSessionEntries();
    this.onConversationSessionEntryAppended?.(conversationSessionEntry, conversationSessionEntries);
    this.onConversationSessionEntriesChanged?.(conversationSessionEntries);
  }

  replaceConversationSessionEntries(conversationSessionEntries: readonly ConversationSessionEntry[]): void {
    this.conversationSessionEntries.splice(0, this.conversationSessionEntries.length, ...conversationSessionEntries);
    this.onConversationSessionEntriesChanged?.(this.listConversationSessionEntries());
  }

  clearConversationSessionEntries(): void {
    if (this.conversationSessionEntries.length === 0) {
      return;
    }

    this.conversationSessionEntries.splice(0, this.conversationSessionEntries.length);
    this.onConversationSessionEntriesChanged?.(this.listConversationSessionEntries());
  }

  listConversationSessionEntries(): readonly ConversationSessionEntry[] {
    return [...this.conversationSessionEntries];
  }

  countConversationSessionEntries(): number {
    return this.conversationSessionEntries.length;
  }

  listModelContextItems(): readonly ModelContextItem[] {
    return projectConversationSessionEntriesToModelContextItems(this.conversationSessionEntries);
  }
}
