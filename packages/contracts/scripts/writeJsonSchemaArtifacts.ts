import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBuliContractJsonSchemaArtifactByFileName,
  createBuliContractJsonSchemaArtifacts,
  type BuliContractJsonSchemaArtifact,
} from "../src/jsonSchemaArtifacts.ts";

export const contractJsonSchemasDirectoryUrl = new URL("../schemas/", import.meta.url);

export function serializeBuliContractJsonSchemaArtifact(
  schemaArtifact: BuliContractJsonSchemaArtifact,
): string {
  return `${JSON.stringify(schemaArtifact.jsonSchema, null, 2)}\n`;
}

export function serializeBuliContractJsonSchemaArtifactByFileName(artifactFileName: string): string {
  const schemaArtifact = createBuliContractJsonSchemaArtifactByFileName(artifactFileName);
  if (!schemaArtifact) {
    throw new Error(`Unknown Buli contract JSON Schema artifact: ${artifactFileName}`);
  }

  return serializeBuliContractJsonSchemaArtifact(schemaArtifact);
}

export async function writeBuliContractJsonSchemaArtifacts(): Promise<void> {
  await mkdir(contractJsonSchemasDirectoryUrl, { recursive: true });
  for (const schemaArtifact of createBuliContractJsonSchemaArtifacts()) {
    const schemaArtifactUrl = new URL(schemaArtifact.artifactFileName, contractJsonSchemasDirectoryUrl);
    await mkdir(dirname(schemaArtifactUrl.pathname), { recursive: true });
    await writeFile(schemaArtifactUrl, serializeBuliContractJsonSchemaArtifact(schemaArtifact), "utf8");
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  await writeBuliContractJsonSchemaArtifacts();
}
