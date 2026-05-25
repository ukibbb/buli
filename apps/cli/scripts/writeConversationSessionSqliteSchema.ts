import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serializeConversationSessionSqliteSchema } from "../src/conversationSession/sqlite/conversationSessionSqliteSchema.ts";

export const conversationSessionSqliteSchemaArtifactUrl = new URL(
  "../schemas/conversation-session-sqlite-v1.sql",
  import.meta.url,
);

export async function writeConversationSessionSqliteSchemaArtifact(): Promise<void> {
  await mkdir(dirname(conversationSessionSqliteSchemaArtifactUrl.pathname), { recursive: true });
  await writeFile(conversationSessionSqliteSchemaArtifactUrl, serializeConversationSessionSqliteSchema(), "utf8");
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  await writeConversationSessionSqliteSchemaArtifact();
}
