import type { ConversationSessionEntry, ModelContextItem } from "@buli/contracts";
import {
  projectConversationSessionEntriesToModelContextItems,
  projectConversationSessionEntryToModelContextItems,
} from "./conversationHistoryProjection.ts";

export class InMemoryConversationHistory {
  readonly conversationSessionEntries: ConversationSessionEntry[];
  readonly modelContextItems: ModelContextItem[];

  constructor(input?: { initialConversationSessionEntries?: readonly ConversationSessionEntry[] }) {
    this.conversationSessionEntries = [...(input?.initialConversationSessionEntries ?? [])];
    this.modelContextItems = projectConversationSessionEntriesToModelContextItems(this.conversationSessionEntries);
  }

  appendConversationSessionEntry(conversationSessionEntry: ConversationSessionEntry): void {
    this.conversationSessionEntries.push(conversationSessionEntry);
    this.modelContextItems.push(...projectConversationSessionEntryToModelContextItems(conversationSessionEntry));
  }

  listConversationSessionEntries(): readonly ConversationSessionEntry[] {
    return [...this.conversationSessionEntries];
  }

  listModelContextItems(): readonly ModelContextItem[] {
    return [...this.modelContextItems];
  }
}
