import { readFile } from "node:fs/promises";
import { expect, test } from "bun:test";
import { createBuliContractJsonSchemaArtifacts } from "../src/index.ts";
import {
  contractJsonSchemasDirectoryUrl,
  serializeBuliContractJsonSchemaArtifact,
} from "../scripts/writeJsonSchemaArtifacts.ts";

test("all committed contract JSON Schema artifacts match generated schemas", async () => {
  for (const schemaArtifact of createBuliContractJsonSchemaArtifacts()) {
    const committedSchemaArtifactText = await readFile(
      new URL(schemaArtifact.artifactFileName, contractJsonSchemasDirectoryUrl),
      "utf8",
    );

    expect(committedSchemaArtifactText).toBe(serializeBuliContractJsonSchemaArtifact(schemaArtifact));
  }
});

test("contract JSON Schema artifact names are stable", () => {
  expect(createBuliContractJsonSchemaArtifacts().map((schemaArtifact) => schemaArtifact.artifactFileName)).toEqual([
    "provider-protocol-v1.schema.json",
    "assistant-response-event-v1.schema.json",
    "provider-stream-event-v1.schema.json",
    "conversation-session-entry-v1.schema.json",
    "conversation-session-model-selection-v1.schema.json",
    "tool-call-request-v1.schema.json",
    "tool-call-detail-v1.schema.json",
    "workspace-patch-v1.schema.json",
  ]);
});
