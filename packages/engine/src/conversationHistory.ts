import type { ConversationSessionEntry, ModelContextItem } from "@buli/contracts";
import { projectConversationSessionEntriesToModelContextItems } from "./conversationHistoryProjection.ts";

export class InMemoryConversationHistory {
  readonly conversationSessionEntries: ConversationSessionEntry[] = [];

  appendConversationSessionEntry(conversationSessionEntry: ConversationSessionEntry): void {
    this.conversationSessionEntries.push(conversationSessionEntry);
  }

  listConversationSessionEntries(): readonly ConversationSessionEntry[] {
    return this.conversationSessionEntries;
  }

  buildModelContextItems(): ModelContextItem[] {
    return projectConversationSessionEntriesToModelContextItems(this.conversationSessionEntries);
  }
}
